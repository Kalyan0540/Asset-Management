import { closeSync, existsSync, fsyncSync, openSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export function commitStagedBlob(root: string, temp: string, hash: string) {
  const file = openSync(temp, 'r+');
  try {
    fsyncSync(file);
  } finally {
    closeSync(file);
  }
  const directory = join(root, 'blobs');
  const destination = join(directory, hash);
  if (existsSync(destination)) {
    unlinkSync(temp);
    return;
  }
  renameSync(temp, destination);
  if (process.platform !== 'win32') {
    const fd = openSync(directory, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
}
