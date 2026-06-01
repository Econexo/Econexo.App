export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

export function fitWithinA4(imgWidth: number, imgHeight: number): { width: number; height: number } {
  const scale = Math.min(A4_WIDTH_PT / imgWidth, A4_HEIGHT_PT / imgHeight);
  return { width: imgWidth * scale, height: imgHeight * scale };
}
