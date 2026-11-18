/** Recover Eagle's folder structure and the labels used by older Atlas imports. */
export function eagleFolders(input: unknown) {
  const ids = new Set<string>();
  const paths = new Set<string>();
  const result: { id: string; parentId: string | null; title: string; oldName: string }[] = [];
  function walk(values: unknown, parentId: string | null, names: string[]) {
    if (!Array.isArray(values) || names.length > 100) throw new Error('Invalid Eagle folder tree.');
    for (const raw of values) {
      if (!raw || typeof raw !== 'object') throw new Error('Invalid Eagle folder.');
      const { id, name, children } = raw;
      if (typeof id !== 'string' || !id || ids.has(id))
        throw new Error('Duplicate or missing Eagle folder ID.');
      const title = typeof name === 'string' && name ? name : 'Untitled';
      const path = [...names, title].join(' / ');
      const oldName = paths.has(path) ? `${path} [${id}]` : path;
      paths.add(oldName);
      ids.add(id);
      result.push({ id, parentId, title, oldName });
      if (Array.isArray(children)) walk(children, id, [...names, title]);
    }
  }
  walk(input, null, []);
  return result;
}
