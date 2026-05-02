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
  // The image prompt asks the model to fill the bg with #00FF00. We still
  // auto-detect from the corner pixel, but bias the tolerance for green
  // chroma keys since AI/JPEG noise around the edge can wobble ±25.
  static bool IsBg(byte r, byte g, byte b, byte bgR, byte bgG, byte bgB, bool greenKey) {
    int dr = Math.Abs(r - bgR), dg = Math.Abs(g - bgG), db = Math.Abs(b - bgB);
    if (greenKey) {
      if (dr <= 35 && dg <= 45 && db <= 35) return true;
      if (g > 140 && g > r + 40 && g > b + 40) return true;
      return false;
    }
    return dr <= 15 && dg <= 15 && db <= 15;
  }

  // Despill pulls the green channel down toward avg(R,B) on opaque pixels
  // that retain a green halo from the chroma background. Removes the rim
  // glow without touching legitimate greens elsewhere.
  static void Despill(byte[] px, int w, int h, int stride, byte[] alphaCopy) {
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        int p = y * stride + x * 4;
        if (alphaCopy[y * w + x] == 0) continue;
        byte r = px[p + 2], g = px[p + 1], b = px[p];
        if (g > r && g > b && g > 100) {
          int target = (r + b) / 2;
          if (g - target > 18) {
            px[p + 1] = (byte)Math.Max(target, g - 30);
          }
        }
      }
    }
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

      byte bgB = px[0], bgG = px[1], bgR = px[2];
      bool greenKey = bgG > 150 && bgG > bgR + 50 && bgG > bgB + 50;

      bool[] seen = new bool[w * h];
      Queue<int> q = new Queue<int>();
      Action<int, int> enq = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        int idx = y * w + x;
        if (seen[idx]) return;
        int p = y * stride + x * 4;
        byte b = px[p], g = px[p + 1], r = px[p + 2];
        if (IsBg(r, g, b, bgR, bgG, bgB, greenKey)) { seen[idx] = true; q.Enqueue(idx); }
      };

      for (int x = 0; x < w; x++) { enq(x, 0); enq(x, h - 1); }
      for (int y = 0; y < h; y++) { enq(0, y); enq(w - 1, y); }

      while (q.Count > 0) {
        int idx = q.Dequeue();
        int x = idx % w, y = idx / w;
        int p = y * stride + x * 4;
        px[p] = 255; px[p + 1] = 255; px[p + 2] = 255; px[p + 3] = 0;
        enq(x + 1, y); enq(x - 1, y); enq(x, y + 1); enq(x, y - 1);
      }

      byte[] alpha = new byte[w * h];
      for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
          alpha[y * w + x] = px[y * stride + x * 4 + 3];
        }
      }
      if (greenKey) Despill(px, w, h, stride, alpha);

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
