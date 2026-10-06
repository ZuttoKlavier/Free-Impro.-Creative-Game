export const clientRole = typeof __STUDENT_IOS__ !== 'undefined' && __STUDENT_IOS__ ? 'student' : location.pathname === '/teacher.html' ? 'teacher' : 'student';
export const apiBase = '/api/' + clientRole;
