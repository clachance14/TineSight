import type { Archiver } from 'archiver'
import { createWriteStream, createReadStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ExportSizeError, MAX_EXPORT_BYTES } from './limits'

interface ArchiveFile {
  append(buffer: Buffer, name: string): Promise<void>
  finish(): Promise<{ stream: ReturnType<typeof createReadStream>; bytes: number }>
  cleanup(): Promise<void>
}

/** Spool to bounded temporary disk, with backpressure, instead of retaining a ZIP in RAM. */
export async function createArchiveFile(archive: Archiver, maxBytes = MAX_EXPORT_BYTES): Promise<ArchiveFile> {
  const directory = await mkdtemp(join(tmpdir(), 'tinesight-export-'))
  const path = join(directory, 'photos.zip')
  let bytes = 0
  let input: ReturnType<typeof createReadStream> | undefined
  const output = createWriteStream(path)
  const guard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      callback(bytes > maxBytes ? new ExportSizeError() : null, chunk)
    },
  })
  const completion = pipeline(archive, guard, output)
  // The producer checks this promise on finish; mark early failures handled too.
  void completion.catch(() => {})
  return {
    async append(buffer: Buffer, name: string): Promise<void> {
      if (archive.destroyed) { await completion; throw new Error('Export archive closed') }
      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => { archive.off('entry', onEntry); archive.off('error', onError); archive.off('close', onClose) }
        const onEntry = (entry: { name: string }): void => { if (entry.name === name) { cleanup(); resolve() } }
        const onError = (error: Error): void => { cleanup(); reject(error) }
        const onClose = (): void => { cleanup(); reject(new Error('Export archive closed before photo completed')) }
        archive.once('close', onClose)
        archive.on('entry', onEntry)
        archive.once('error', onError)
        archive.append(buffer, { name })
      })
    },
    async finish(): Promise<{ stream: ReturnType<typeof createReadStream>; bytes: number }> {
      await Promise.all([archive.finalize(), completion])
      input = createReadStream(path)
      return { stream: input, bytes }
    },
    async cleanup(): Promise<void> {
      input?.destroy()
      archive.abort()
      archive.destroy()
      guard.destroy()
      output.destroy()
      await completion.catch(() => {})
      await rm(directory, { recursive: true, force: true })
    },
  }
}
