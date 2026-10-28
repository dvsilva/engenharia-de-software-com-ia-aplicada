import { createHash } from 'node:crypto';

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OPCODES = Object.freeze({
  continuation: 0x0,
  text: 0x1,
  close: 0x8,
  ping: 0x9,
  pong: 0xa,
});

const frameHeader = (opcode, length) => {
  const first = 0x80 | opcode;

  if (length < 126) return Buffer.from([first, length]);
  if (length < 65536) {
    const header = Buffer.from([first, 126, 0, 0]);

    header.writeUInt16BE(length, 2);
    return header;
  }

  const header = Buffer.from([first, 127, 0, 0, 0, 0, 0, 0, 0, 0]);

  header.writeBigUInt64BE(BigInt(length), 2);
  return header;
};

const payloadSpan = (buffer) => {
  const length = buffer[1] & 0x7f;

  if (length === 126)
    return buffer.length < 4
      ? null
      : { length: buffer.readUInt16BE(2), start: 4 };
  if (length === 127)
    return buffer.length < 10
      ? null
      : { length: Number(buffer.readBigUInt64BE(2)), start: 10 };

  return { length, start: 2 };
};

const readFrame = (buffer) => {
  const span = buffer.length < 2 ? null : payloadSpan(buffer);
  if (!span) return null;

  const masked = (buffer[1] & 0x80) !== 0;
  const start = span.start + (masked ? 4 : 0);
  const size = start + span.length;
  if (buffer.length < size) return null;

  const mask = buffer.subarray(span.start, start);

  return {
    final: (buffer[0] & 0x80) !== 0,
    opcode: buffer[0] & 0x0f,
    payload: Buffer.from(
      buffer
        .subarray(start, size)
        .map((byte, index) => (masked ? byte ^ mask[index % 4] : byte))
    ),
    size,
  };
};

const openSocket = (socket) => {
  const received = [];
  let pending = Buffer.alloc(0);
  let fragments = [];

  const write = (opcode, payload) =>
    socket.write(Buffer.concat([frameHeader(opcode, payload.length), payload]));

  const handle = ({ final, opcode, payload }) => {
    if (opcode === OPCODES.ping) {
      write(OPCODES.pong, payload);
      return;
    }
    if (opcode === OPCODES.close) {
      write(OPCODES.close, payload.subarray(0, 2));
      socket.end();
      return;
    }
    if (opcode === OPCODES.continuation && fragments.length === 0) return;
    if (opcode !== OPCODES.text && opcode !== OPCODES.continuation) return;

    fragments.push(payload);
    if (!final) return;

    received.push(Buffer.concat(fragments).toString('utf8'));
    fragments = [];
  };

  socket.on('error', () => {});
  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);

    for (let frame = readFrame(pending); frame; frame = readFrame(pending)) {
      pending = pending.subarray(frame.size);
      handle(frame);
    }
  });

  return {
    received,
    send: (text) => write(OPCODES.text, Buffer.from(text)),
    close: () => socket.destroy(),
  };
};

export const acceptSocket = (request, socket) => {
  const key = request.headers['sec-websocket-key'];

  if (request.headers.upgrade?.toLowerCase() !== 'websocket' || !key) {
    socket.destroy();
    return null;
  }

  const accept = createHash('sha1')
    .update(`${key}${WEBSOCKET_GUID}`)
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n')
  );

  return openSocket(socket);
};
