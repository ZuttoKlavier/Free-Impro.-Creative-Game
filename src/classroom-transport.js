// iOS runs the bundled student UI locally. Network access starts only when
// the student explicitly enters a classroom; changing views never connects.
export const isOfflineStudent = () => window.FreeImproClassroom?.offline === true;
export const canUseClassroom = () => !isOfflineStudent() || window.FreeImproClassroom.connected === true;

export async function classroomFetch(path, options = {}) {
  if (!isOfflineStudent()) return fetch(path, options);
  return window.FreeImproClassroom.request(path, options);
}
