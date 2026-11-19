import React, { useEffect, useRef, useState } from 'react';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Uma miniatura real da primeira página, nunca o visualizador embutido do
// navegador (que no Firefox mostra barra de ferramentas e várias páginas).
// O worker é empacotado pelo Vite na MESMA versão do PDF.js instalado.
export default function PdfThumbnail({ file, onPageCount }) {
  const canvasRef = useRef(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    if (!file) return undefined;
    let cancelled = false;
    let loadingTask;
    let renderTask;
    setState('loading');

    const run = async () => {
      try {
        if (file.size > 25 * 1024 * 1024) {
          setState('fallback');
          return;
        }
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

        const data = new Uint8Array(await file.arrayBuffer());
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
        const document = await loadingTask.promise;
        if (cancelled) return;
        onPageCount?.(document.numPages);

        const page = await document.getPage(1);
        if (cancelled) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d', { alpha: false });
        if (!canvas || !context) throw new Error('Canvas indisponível');

        const original = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 520 / original.width);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (!cancelled) setState('ready');
      } catch (error) {
        if (!cancelled && error?.name !== 'RenderingCancelledException') {
          console.warn('[IA Studio PDF] Não foi possível gerar miniatura:', error);
          setState('fallback');
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* já finalizada */ }
      void loadingTask?.destroy();
    };
  }, [file, onPageCount]);

  return (
    <div className="relative flex h-[180px] w-full items-center justify-center overflow-hidden bg-[#f5f5f5]">
      <canvas
        ref={canvasRef}
        aria-label="Miniatura da primeira página do PDF"
        className={state === 'ready' ? 'block max-h-full max-w-full object-contain' : 'hidden'}
      />
      {state === 'loading' && (
        <span className="text-xs text-[#667781]">Gerando miniatura…</span>
      )}
      {state === 'fallback' && (
        <div className="flex flex-col items-center gap-2 text-[#667781]">
          <div className="flex h-16 w-12 items-center justify-center rounded border border-gray-200 bg-white shadow-sm">
            <span className="rounded-sm bg-[#e53935] px-1 py-0.5 text-xs font-bold text-white">PDF</span>
          </div>
          <span className="text-xs">Documento PDF</span>
        </div>
      )}
    </div>
  );
}
