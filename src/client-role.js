const teacherPage = location.pathname === '/teacher.html' || location.pathname === '/api/admin/preview/teacher';
export const clientRole = typeof __STUDENT_IOS__ !== 'undefined' && __STUDENT_IOS__ ? 'student' : teacherPage ? 'teacher' : 'student';
export const apiBase = '/api/' + clientRole;
