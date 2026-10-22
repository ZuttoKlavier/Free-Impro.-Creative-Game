export function imageRequestStatus(request) {
  const status = request?.pendingStatus || request?.status;
  if (status === 'processing') return '老师正在生成图像，请稍候。';
  if (status === 'completed') return '图片已完成，正在同步到本地。';
  if (status === 'rejected') return '本次申请未完成，请联系老师。';
  if (status === 'submitting' || status === 'unconfirmed') return '申请尚未确认，可重试提交。';
  return '申请已提交，等待老师处理。';
}
