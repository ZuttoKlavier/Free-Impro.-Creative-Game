export const clientRole = location.pathname === '/teacher.html' ? 'teacher' : 'student';
export const apiBase = '/api/' + clientRole;
