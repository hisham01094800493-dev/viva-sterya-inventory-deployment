import { useEffect } from "react";

export default function MobilePdfToolbarCollapser() {
  useEffect(() => {
    const attach = () => {
      document.querySelectorAll<HTMLElement>(".pdf-action-toolbar").forEach(toolbar => {
        if (toolbar.querySelector("[data-pdf-toolbar-toggle='true']")) return;
        toolbar.dataset.pdfCollapsed = "true";
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.pdfToolbarToggle = "true";
        button.className = "pdf-toolbar-more-button inline-flex items-center justify-center rounded-xl border border-[#b9d4d9] px-3 text-xs font-bold text-[#0d4f62]";
        button.innerHTML = '<span>المزيد</span><span class="pdf-toolbar-more-arrow" aria-hidden="true">⌄</span>';
        const sync = () => {
          const collapsed = toolbar.dataset.pdfCollapsed !== "false";
          button.title = collapsed ? "فتح الأدوات الإضافية" : "طي الأدوات الإضافية";
          button.dataset.tooltip = button.title;
          button.setAttribute("aria-label", button.title);
          button.setAttribute("aria-expanded", String(!collapsed));
          button.querySelector(".pdf-toolbar-more-arrow")?.classList.toggle("pdf-toolbar-more-arrow--open", !collapsed);
        };
        button.addEventListener("click", () => { toolbar.dataset.pdfCollapsed = toolbar.dataset.pdfCollapsed === "false" ? "true" : "false"; sync(); });
        toolbar.appendChild(button);
        sync();
      });
      if (window.matchMedia("(max-width: 767px)").matches) {
        document.querySelectorAll<HTMLElement>('[role="dialog"], [data-slot="dialog-content"]').forEach(dialog => {
          const heading = Array.from(dialog.querySelectorAll<HTMLElement>('h2, [role="heading"]')).find(item => item.textContent?.includes("المعاينة النهائية لتقرير"));
          const canvasHost = dialog.querySelector<HTMLElement>(".pdf-page-canvas-host");
          if (heading && canvasHost?.parentElement?.previousElementSibling) {
            canvasHost.parentElement.previousElementSibling.classList.add("report-pdf-preview-controls");
            dialog.querySelector<HTMLElement>(".pdf-action-toolbar")?.classList.add("report-pdf-action-toolbar");
          }
        });
      }
      document.querySelectorAll<HTMLElement>('[role="dialog"], [data-slot="dialog-content"]').forEach(dialog => {
        const heading = Array.from(dialog.querySelectorAll<HTMLElement>('h2, [role="heading"]')).find(item => item.textContent?.includes("معاينة كشف الحساب PDF") || item.textContent?.includes("معاينة كارت الصنف PDF"));
        if (heading) dialog.querySelector<HTMLElement>(".pdf-action-toolbar")?.classList.add("item-card-pdf-action-toolbar");
      });
    };
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    attach();
    return () => observer.disconnect();
  }, []);
  return null;
}
