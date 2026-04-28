import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

export async function pidAlive(pid) {
  try {
    await pexec('kill', ['-0', String(pid)]);
    return true;
  } catch { return false; }
}

export async function listClaudePids() {
  try {
    const { stdout } = await pexec('pgrep', ['-fl', 'claude']);
    return stdout.split('\n').filter(Boolean).map(line => {
      const [pid, ...rest] = line.trim().split(/\s+/);
      return { pid: Number(pid), cmd: rest.join(' ') };
    });
  } catch { return []; }
}
