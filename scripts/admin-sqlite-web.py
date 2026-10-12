"""Read-only, credential-redacted sqlite-web for the authenticated Node proxy."""
import argparse
import json
import logging
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import threading
import time

from flask import abort, request
from sqlite_web.sqlite_web import app, initialize_app, __version__
from werkzeug.serving import WSGIRequestHandler, make_server

PREFIX = '/api/admin/database'
SECRET_COLUMNS = {
    'users': {'password', 'salt', 'password_hash', 'password_salt'},
    'sessions': {'token'},
    'image_mcp_tokens': {'digest'},
    'image_mcp_activity': {'digest'},
    'image_jobs': {'claim_id'},
    'admin_accounts': {'password', 'salt', 'password_hash', 'password_salt'},
    'admin_sessions': {'token'},
}
READ_PRAGMAS = {
    'table_info', 'table_xinfo', 'index_info', 'index_xinfo', 'index_list',
    'foreign_key_list', 'table_list', 'database_list', 'compile_options',
}
VALUE_PRAGMAS = {'data_version', 'schema_version', 'user_version', 'page_size', 'page_count', 'freelist_count', 'foreign_keys', 'query_only', 'journal_mode'}
BLOCKED_FUNCTIONS = {'load_extension', 'readfile', 'writefile', 'edit', 'shell', 'system', 'fts3_tokenizer', 'zipfile'}


def authorizer(action, first, second, database, source):
    if action == sqlite3.SQLITE_READ:
        if (first or '').lower() in {'sqlite_dbpage', 'sqlite_dbdata', 'sqlite_dbptr'}:
            return sqlite3.SQLITE_DENY
        if (first or '').lower() in SECRET_COLUMNS and (second or '').lower() in SECRET_COLUMNS[(first or '').lower()]:
            return sqlite3.SQLITE_IGNORE
        return sqlite3.SQLITE_OK
    if action == sqlite3.SQLITE_FUNCTION:
        return sqlite3.SQLITE_DENY if (second or first or '').lower() in BLOCKED_FUNCTIONS else sqlite3.SQLITE_OK
    if action == sqlite3.SQLITE_PRAGMA:
        name = (first or '').lower()
        if name in READ_PRAGMAS or (name in VALUE_PRAGMAS and second is None):
            return sqlite3.SQLITE_OK
        return sqlite3.SQLITE_DENY
    if action in {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_RECURSIVE, sqlite3.SQLITE_TRANSACTION, sqlite3.SQLITE_SAVEPOINT}:
        return sqlite3.SQLITE_OK
    return sqlite3.SQLITE_DENY


def secure_connection(database):
    connection = database.connection()
    connection.set_authorizer(None)
    connection.execute('PRAGMA query_only = ON')
    connection.execute('PRAGMA busy_timeout = 1500')
    if hasattr(connection, 'enable_load_extension'):
        connection.enable_load_extension(False)
    connection.set_authorizer(authorizer)
    deadline = time.monotonic() + 2
    connection.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 10000)


@app.before_request
def read_only_routes():
    if request.endpoint is None:
        return None  # Let Flask issue canonical trailing-slash redirects/404s.
    allowed = {'index', 'table_structure', 'table_content', 'table_row_detail', 'table_query', 'generic_query', 'table_export', 'static'}
    if request.endpoint not in allowed:
        abort(403, '该操作由管理员业务页面处理。')
    if request.method not in {'GET', 'HEAD', 'POST'}:
        abort(405)
    if request.method == 'POST' and request.endpoint not in {'generic_query', 'table_query', 'table_export'}:
        abort(403, '数据库浏览工具仅允许读取。')


class QuietHandler(WSGIRequestHandler):
    def log_request(self, code='-', size='-'):
        pass

    def log_error(self, format, *args):
        pass

    def log_message(self, format, *args):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', required=True)
    options = parser.parse_args()
    database = Path(options.database)
    if not database.is_absolute() or not database.is_file():
        raise ValueError('Database file must already exist.')
    if __version__ != '0.8.2':
        raise ValueError('Unsupported sqlite-web version.')
    logging.disable(logging.CRITICAL)
    app.config.update(SECRET_KEY=secrets.token_hex(32), ENABLE_LOAD=False, ENABLE_FILESYSTEM=False,
                      ROWS_PER_PAGE=50, QUERY_ROWS_PER_PAGE=100, MAX_CONTENT_LENGTH=1048576,
                      SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Strict')
    initialize_app([os.fspath(database)], read_only=True, url_prefix=PREFIX, startup_hook=secure_connection)
    server = make_server('127.0.0.1', 0, app, threaded=False, request_handler=QuietHandler)

    def stop_with_parent():
        # The parent keeps this pipe open. EOF also cleans up after a crash.
        while sys.stdin.buffer.read(1):
            pass
        server.shutdown()

    threading.Thread(target=stop_with_parent, daemon=True).start()
    print(json.dumps({'ready': True, 'port': server.server_port, 'version': __version__}), flush=True)
    server.serve_forever()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Library exceptions can contain SQL/record data; never print them.
        print('Database browser could not start.', file=sys.stderr)
        sys.exit(1)
