import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const POWERSHELL_CUTOUT_SCRIPT = String.raw`
param([string]$SourcePath, [string]$OutputPath)
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class CutoutTool {
  static bool IsBg(byte r, byte g, byte b, byte bgR, byte bgG, byte bgB) {
    return Math.Abs(r - bgR) <= 15 && Math.Abs(g - bgG) <= 15 && Math.Abs(b - bgB) <= 15;
  }

  public static void Run(string src, string dst) {
    using (var input = new Bitmap(src))
    using (var bmp = new Bitmap(input.Width, input.Height, PixelFormat.Format32bppArgb)) {
      using (var gr = Graphics.FromImage(bmp)) gr.DrawImage(input, 0, 0, input.Width, input.Height);
      int w = bmp.Width, h = bmp.Height;
      var rect = new Rectangle(0, 0, w, h);
      var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
      int stride = data.Stride;
      int len = Math.Abs(stride) * h;
      byte[] px = new byte[len];
      Marshal.Copy(data.Scan0, px, 0, len);
      
      // Sample background color from the top-left pixel
      byte bgB = px[0], bgG = px[1], bgR = px[2];
      
      bool[] seen = new bool[w * h];
      Queue<int> q = new Queue<int>();
      Action<int, int> enq = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        int idx = y * w + x;
        if (seen[idx]) return;
        int p = y * stride + x * 4;
        byte b = px[p], g = px[p + 1], r = px[p + 2];
        if (IsBg(r, g, b, bgR, bgG, bgB)) { seen[idx] = true; q.Enqueue(idx); }
      };
      
      // Start flood fill from the borders
      for (int x = 0; x < w; x++) { enq(x, 0); enq(x, h - 1); }
      for (int y = 0; y < h; y++) { enq(0, y); enq(w - 1, y); }
      
      while (q.Count > 0) {
        int idx = q.Dequeue();
        int x = idx % w, y = idx / w;
        int p = y * stride + x * 4;
        px[p] = 255; px[p + 1] = 255; px[p + 2] = 255; px[p + 3] = 0;
        enq(x + 1, y); enq(x - 1, y); enq(x, y + 1); enq(x, y - 1);
      }
      
      Marshal.Copy(px, 0, data.Scan0, len);
      bmp.UnlockBits(data);
      bmp.Save(dst, ImageFormat.Png);
    }
  }
}
'@
[CutoutTool]::Run($SourcePath, $OutputPath)
`;

export async function createTransparentCutout(imagePath) {
  if (process.platform !== 'win32') return null;
  const parsed = path.parse(imagePath);
  const outputPath = path.join(parsed.dir, `${parsed.name}-cutout.png`);
  const scriptPath = path.join(parsed.dir, `${parsed.name}-cutout.ps1`);
  await fs.writeFile(scriptPath, POWERSHELL_CUTOUT_SCRIPT, 'utf8');
  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      imagePath,
      outputPath,
    ], { windowsHide: true, timeout: 30000 });
    await fs.unlink(scriptPath).catch(() => {});
    return outputPath;
  } catch {
    await fs.unlink(scriptPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
    return null;
  }
}
