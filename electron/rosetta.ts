import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function isRunningUnderRosetta() {
  if (process.platform !== 'darwin' || process.arch !== 'x64') {
    return false;
  }

  try {
    const { stdout } = await execFileAsync('/usr/sbin/sysctl', ['-in', 'sysctl.proc_translated']);
    return stdout.trim() === '1';
  } catch {
    return false;
  }
}
