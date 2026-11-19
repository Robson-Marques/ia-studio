import React, { useEffect, useRef, useState } from 'react';

// Renderiza apenas a primeira página. O iframe de PDF não fornece miniatura
// confiável em Firefox/iOS e pode mostrar a barra completa do visualizador.
// PDF.js fica em chunk lazy, só carregado para documentos PDF visíveis.
export default function PdfThumbnail({ file }) {
  const canvasRef = useRef(null);
  const [preview, setPreview] = useState('loading');

  useEffect(() => {
    if (!file) return undefined;
    let disposed = false;
    let task;
    let renderTask;
    let pdf;
    setPreview('loading');

    const render = async () => {
      try {
        // PDF grande segue disponível para download, sem alocar um segundo
        // arquivo enorme em memória apenas para mostrar a miniatura.
        if (file.size > 25 * 1024 * 1024) {
          setPreview('unavailable');
          return;
        }
        const [pdfjs, workerModule] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (disposed) return;
        task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
        pdf = await task.promise;
        if (disposed) return;
        const page = await pdf.getPage(1);
        if (disposed) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.7, 520 / viewport.width);
        const target = page.getViewport({ scale });
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas indisponível');
        canvas.width = Math.round(target.width);
        canvas.height = Math.round(target.height);
        renderTask = page.render({ canvasContext: context, viewport: target });
        await renderTask.promise;
        if (!disposed) setPreview('ready');
      } catch (error) {
        if (!disposed && error?.name !== 'RenderingCancelledException') {
          setPreview('unavailable');
        }
      }
    };
    void render();
    return () => {
      disposed = true;
      try { renderTask?.cancel(); } catch { /* task cancelável */ }
      void task?.destroy();
    };
  }, [file]);

  return (
    <div className="relative flex h-[180px] w-full items-center justify-center overflow-hidden bg-[#f5f5f5]">
      <canvas
        ref={canvasRef}
        aria-label="Primeira página do documento PDF"
        className={preview === 'ready' ? 'block max-h-full max-w-full object-contain' : 'hidden'}
      />
      {preview === 'loading' && (
        <span className="text-xs text-gray-500">Preparando prévia do PDF…</span>
      )}
      {preview === 'unavailable' && (
        <div className="flex flex-col items-center gap-1 text-gray-500">
          <span className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white">PDF</span>
          <span className="text-xs">Prévia indisponível</span>
        </div>
      )}
    </div>
  );
}
