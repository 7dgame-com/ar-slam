// @ts-ignore -- spark-md5 declarations are optional in this plugin runtime.
import SparkMD5 from 'spark-md5'

export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Blob could not be read.'))
    reader.readAsArrayBuffer(blob)
  })
}

export async function blobMd5(blob: Blob): Promise<string> {
  const spark = new SparkMD5.ArrayBuffer()
  const chunkSize = 2 * 1024 * 1024

  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    spark.append(await blobToArrayBuffer(blob.slice(offset, offset + chunkSize)))
  }

  return spark.end()
}
