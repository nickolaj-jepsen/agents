/** A tiny PNG codec for the catalogue's crops: 8-bit RGB(A), no interlace, which is what the e2e screenshots are. */
import { crc32, deflateSync, inflateSync } from "node:zlib";

export type Image = { w: number; h: number; channels: number; data: Uint8Array };

export function decode(buf: Uint8Array): Image {
  const b = Buffer.from(buf);
  let w = 0;
  let h = 0;
  let channels = 4;
  const idat: Buffer[] = [];
  for (let at = 8; at < b.length; ) {
    const len = b.readUInt32BE(at);
    const type = b.toString("latin1", at + 4, at + 8);
    const body = b.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      const depth = body[8]!;
      const color = body[9]!;
      if (depth !== 8 || (color !== 2 && color !== 6) || body[12] !== 0)
        throw new Error("png: only 8-bit RGB/RGBA without interlace");
      channels = color === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(body);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const data = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x]!;
      const left = x >= channels ? data[y * stride + x - channels]! : 0;
      const up = y > 0 ? data[(y - 1) * stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? data[(y - 1) * stride + x - channels]! : 0;
      let v = cur;
      if (filter === 1) v += left;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        v += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      data[y * stride + x] = v & 255;
    }
  }
  return { w, h, channels, data };
}

export function crop(img: Image, x: number, y: number, w: number, h: number): Image {
  const c = img.channels;
  const out = new Uint8Array(w * h * c);
  for (let row = 0; row < h; row++)
    out.set(
      img.data.subarray(((y + row) * img.w + x) * c, ((y + row) * img.w + x + w) * c),
      row * w * c,
    );
  return { w, h, channels: c, data: out };
}

export function encode(img: Image): Uint8Array {
  const stride = img.w * img.channels;
  const raw = Buffer.alloc(img.h * (stride + 1));
  for (let y = 0; y < img.h; y++)
    raw.set(img.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const chunk = (type: string, body: Buffer) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "latin1");
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(img.w, 0);
  head.writeUInt32BE(img.h, 4);
  head[8] = 8;
  head[9] = img.channels === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
