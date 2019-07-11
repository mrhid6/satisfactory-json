
type Key = string | number;

interface OutputBufferBuffer {
    bytes: string;
    length: number;
}

export class DataBuffer {
    public buffer: Buffer;

    //#region read buffer
    public cursor: number;
    public bytesRead: number;

    //#endregion

    //#region write buffer
    public bytes: string = '';
    public buffers: OutputBufferBuffer[] = [];
    constructor(buffer: Buffer) {
        this.buffer = buffer;
        this.cursor = 0;
        this.bytesRead = 0;
    }
    public readInt(): number {
        const result = this.buffer.readInt32LE(this.cursor);
        this.cursor += 4;
        this.bytesRead += 4;
        return result;
    }
    public readLong(): string {
        /*let result = this.buffer.readInt32LE(this.cursor);
              // TODO figure out how to actually deal with longs in JS!
              this.cursor += 8;
              this.bytesRead += 8;
              return result;*/
        return this.readHex(8);
    }
    public readByte(): number {
        const result = this.buffer.readUInt8(this.cursor);
        this.cursor += 1;
        this.bytesRead += 1;
        return result;
    }
    public readFloat(): number {
        const result = this.buffer.readFloatLE(this.cursor);
        this.cursor += 4;
        this.bytesRead += 4;
        return result;
    }
    public readHex(count: number): string {
        const result = this.buffer
            .slice(this.cursor, this.cursor + count)
            .toString('hex');
        this.cursor += count;
        this.bytesRead += count;
        return result;
    }
    // https://stackoverflow.com/a/14601808
    public decodeUTF16LE(binaryStr: string): string {
        const cp = [];
        for (let i = 0; i < binaryStr.length; i += 2) {
            cp.push(binaryStr.charCodeAt(i) | (binaryStr.charCodeAt(i + 1) << 8));
        }
        return String.fromCharCode.apply(String, cp);
    }
    public readLengthPrefixedString(): string {
        let length = this.readInt();
        if (length === 0) {
            return '';
        }
        let utf16 = false;
        if (length < 0) {
            // Thanks to @Goz3rr we know that this is now an utf16 based string
            // throw new Error('length of string < 0: ' + length);
            length = -2 * length;
            utf16 = true;
        }
        if (this.cursor + length > this.buffer.length) {
            console.log(this.readHex(32));
            // tslint:disable-next-line: no-console
            console.trace('buffer < ' + length);
            throw new Error('cannot read string of length: ' + length);
        }
        let resultStr;
        if (utf16) {
            const result = this.buffer.slice(this.cursor, this.cursor + length - 2);
            resultStr = this.decodeUTF16LE(result.toString('binary'));
            this.cursor += length - 2;
            this.bytesRead += length - 2;
        } else {
            const result = this.buffer.slice(this.cursor, this.cursor + length - 1);
            resultStr = result.toString('utf8');
            this.cursor += length - 1;
            this.bytesRead += length - 1;
        }
        if (this.cursor < 0) {
            throw new Error('Cursor overflowed to ' + this.cursor + ' by ' + length);
        }
        if (utf16) {
            this.assertNullByteString(length, resultStr); // two null bytes for utf16
        }
        this.assertNullByteString(length, resultStr);
        return resultStr;
    }
    public assertNullByteString(length: number, result: string) {
        const zero = this.buffer.readInt8(this.cursor);
        if (zero !== 0) {
            throw new Error('string (length: ' + length +
                ') does not end with zero, but with ' + zero + ': ' + result);
        }
        this.cursor += 1;
        this.bytesRead += 1;
    }
    public assertNullByte() {
        const zero = this.buffer.readInt8(this.cursor);
        if (zero !== 0) {
            throw new Error('expected 0 byte, but got ' + zero);
        }
        this.cursor += 1;
        this.bytesRead += 1;
    }
    public assertNullInt() {
        const zero = this.readInt();
        if (zero !== 0) {
            console.log(this.readHex(32));
            throw new Error('expected 0 int, but got ' + zero);
        }
    }
    public resetBytesRead() {
        this.bytesRead = 0;
    }

    public write(bytes: string, count = true) {
        if (this.buffers.length === 0) {
            this.bytes += bytes;
        } else {
            this.buffers[this.buffers.length - 1].bytes += bytes;
            if (count) {
                this.buffers[this.buffers.length - 1].length += bytes.length;
            }
        }
    }
    public addBuffer() {
        this.buffers.push({ bytes: '', length: 0 });
    }
    public endBufferAndWriteSize() {
        const buffer = this.buffers[this.buffers.length - 1];
        this.buffers.pop(); // remove last element
        this.writeInt(buffer.length);
        this.write(buffer.bytes); // TODO check if correct
        return buffer.length;
    }
    public writeInt(value: number, count = true) {
        const buffer = Buffer.alloc(4);
        buffer.writeInt32LE(value, 0);
        this.write(buffer.toString('binary'), count);
    }
    public writeLong(value: string) {
        this.writeHex(value);
    }
    public writeByte(value: number, count = true) {
        this.write(String.fromCharCode(value), count);
    }
    public writeFloat(value: number) {
        const buffer = Buffer.alloc(4);
        buffer.writeFloatLE(value, 0);
        this.write(buffer.toString('binary'));
    }
    public writeHex(value: string, count = true) {
        const buffer = Buffer.from(value, 'hex');
        this.write(buffer.toString('binary'), count);
    }
    // https://stackoverflow.com/a/14313213
    public isASCII(str: string): boolean {
        return /^[\x00-\x7F]*$/.test(str);
    }
    // https://stackoverflow.com/a/24391376
    public encodeUTF16LE(text: string) {
        const byteArray = new Uint8Array(text.length * 2);
        for (let i = 0; i < text.length; i++) {
            byteArray[i * 2] = text.charCodeAt(i) & 0xff;
            byteArray[i * 2 + 1] = (text.charCodeAt(i) >> 8) & 0xff;
        }
        return String.fromCharCode.apply(String, byteArray as any);
    }
    public writeLengthPrefixedString(value: string, count = true) {
        if (value.length === 0) {
            this.writeInt(0, count);
        } else {
            if (this.isASCII(value)) {
                this.writeInt(value.length + 1, count);
                this.write(value, count);
                this.writeByte(0, count);
            } else {
                this.writeInt(-value.length - 1, count);
                this.write(this.encodeUTF16LE(value));
                this.writeByte(0, count);
                this.writeByte(0, count);
            }
        }
    }
    //#endregion

    //#region transforms
    public transformInt(obj: any, key: string | number, toSav: boolean, count: boolean = true) {
        if (toSav) {
            this.writeInt(obj[key], count);
        } else {
            obj[key] = this.readInt();
        }
    }
    public transformString(obj: any, key: string | number, toSav: boolean, count: boolean = true) {
        if (toSav) {
            this.writeLengthPrefixedString(obj[key], count);
        } else {
            obj[key] = this.readLengthPrefixedString();
        }
    }
    public transformFloat(obj: any, key: string | number, toSav: boolean) {
        if (toSav) {
            this.writeFloat(obj[key]);
        } else {
            obj[key] = this.readFloat();
        }
    }
    public transformLong(obj: any, key: string | number, toSav: boolean) {
        if (toSav) {
            this.writeLong(obj[key]);
        } else {
            obj[key] = this.readLong();
        }
    }
    public transformByte(obj: any, key: Key, toSav: boolean, count: boolean = true) {
        if (toSav) {
            this.writeByte(obj[key], count);
        } else {
            obj[key] = this.readByte();
        }
    }
    public transformBufferStart(toSav: boolean, resetBytesRead: boolean): number {
        if (toSav) {
            this.addBuffer();
            return 0;
        } else {
            const length = this.readInt();
            if (resetBytesRead) {
                // is currently only true for the Entity as we don't add
                // missing sections anywhere else
                this.resetBytesRead();
            }
            return length;
        }
    }
    public transformBufferEnd(toSav: boolean) {
        if (toSav) {
            this.endBufferAndWriteSize();
        } else {
            // TODO write missing?
        }
    }
    public transformAssertNullByte(toSav: boolean, count: boolean = true) {
        if (toSav) {
            this.writeByte(0, count);
        } else {
            this.assertNullByte();
        }
    }

    public transformAssertNullInt(toSav: boolean, count: boolean = true) {
        if (toSav) {
            this.writeInt(0, count);
        } else {
            this.assertNullInt();
        }
    }

    public transformHex(obj: any, key: Key,
        count: number, toSav: boolean, shouldCount: boolean = true) {
        if (toSav) {
            this.writeHex(obj[key], shouldCount);
        } else {
            obj[key] = this.readHex(count);
        }
    }
    //#endregion
}
