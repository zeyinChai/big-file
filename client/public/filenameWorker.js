self.addEventListener("message", async (event) => {
  const file = event.data;
  const filename = await getFileName(file);
  self.postMessage(filename);
});

/**
 * 根据文件对象获取文件内容得到hash文件名
 * @param {*} file 文件对象
 */
async function getFileName(file) {
  const fileHash = await calculateFileHash(file);
  // 获取文件拓展名
  const fileExtension = file.name.split(".").pop();
  return `${fileHash}.${fileExtension}`;
}
/**
 * 计算文件内容生成hash值
 * @param {*} file
 * @returns
 */
async function calculateFileHash(file) {
  // 拿到二进制文件buffer对象
  const arrayBuffer = await file.arrayBuffer();
  console.log(arrayBuffer, "arrayBuffer");
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  console.log(hashBuffer, "hashBuffer");
  return bufferToHex(hashBuffer);
}
/**
 * 把一个arraybuffer转成一个16进制的字符串
 * @param {*} buffer
 * @returns
 */
function bufferToHex(buffer) {
  // Uint8Array类型化的数组 通过这个可以读写buffer
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
