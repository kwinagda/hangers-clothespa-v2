/* @ds-bundle: {"namespace":"HangersCRM","components":[{"name":"Badge","sourcePath":"components/general/Badge/Badge.jsx"},{"name":"Button","sourcePath":"components/general/Button/Button.jsx"},{"name":"EmptyState","sourcePath":"components/general/EmptyState/EmptyState.jsx"},{"name":"ErrorState","sourcePath":"components/general/ErrorState/ErrorState.jsx"},{"name":"InlineLoader","sourcePath":"components/general/InlineLoader/InlineLoader.jsx"},{"name":"PageHeader","sourcePath":"components/general/PageHeader/PageHeader.jsx"},{"name":"PaginationControls","sourcePath":"components/general/PaginationControls/PaginationControls.jsx"},{"name":"SkeletonCard","sourcePath":"components/general/SkeletonCard/SkeletonCard.jsx"},{"name":"SkeletonLine","sourcePath":"components/general/SkeletonLine/SkeletonLine.jsx"},{"name":"StatCard","sourcePath":"components/general/StatCard/StatCard.jsx"},{"name":"TableLoader","sourcePath":"components/general/TableLoader/TableLoader.jsx"}],"sourceHashes":{"components/general/Badge/Badge.jsx":"7b37de43d094","components/general/Badge/Badge.d.ts":"b5af86a4e454","components/general/Badge/Badge.prompt.md":"e76eac1dbdd9","components/general/Button/Button.jsx":"fd7943762def","components/general/Button/Button.d.ts":"545466d8b9a8","components/general/Button/Button.prompt.md":"6054863b9702","components/general/EmptyState/EmptyState.jsx":"30cb73f3806f","components/general/EmptyState/EmptyState.d.ts":"cf1d2ba68e26","components/general/EmptyState/EmptyState.prompt.md":"addf9b36381c","components/general/ErrorState/ErrorState.jsx":"9164add0f006","components/general/ErrorState/ErrorState.d.ts":"aaad75ad455c","components/general/ErrorState/ErrorState.prompt.md":"68019219e2ea","components/general/InlineLoader/InlineLoader.jsx":"cab7b0fbddd9","components/general/InlineLoader/InlineLoader.d.ts":"e53033063283","components/general/InlineLoader/InlineLoader.prompt.md":"d15955c5317d","components/general/PageHeader/PageHeader.jsx":"5e1272542443","components/general/PageHeader/PageHeader.d.ts":"bcaf6bddd3da","components/general/PageHeader/PageHeader.prompt.md":"82a43b662813","components/general/PaginationControls/PaginationControls.jsx":"03e1c92f7393","components/general/PaginationControls/PaginationControls.d.ts":"40d02b423dbd","components/general/PaginationControls/PaginationControls.prompt.md":"3566f2ff2149","components/general/SkeletonCard/SkeletonCard.jsx":"98a2183938ab","components/general/SkeletonCard/SkeletonCard.d.ts":"9c384e68a8c5","components/general/SkeletonCard/SkeletonCard.prompt.md":"cbabb112906a","components/general/SkeletonLine/SkeletonLine.jsx":"c0142b56728d","components/general/SkeletonLine/SkeletonLine.d.ts":"1e4e531789fa","components/general/SkeletonLine/SkeletonLine.prompt.md":"df1a1b9049b6","components/general/StatCard/StatCard.jsx":"428c2da399fd","components/general/StatCard/StatCard.d.ts":"60ad0ffc29b7","components/general/StatCard/StatCard.prompt.md":"5c1af88181de","components/general/TableLoader/TableLoader.jsx":"be075eadc85d","components/general/TableLoader/TableLoader.d.ts":"ef059d0ae948","components/general/TableLoader/TableLoader.prompt.md":"cebac3344590"},"inlinedExternals":[],"builtBy":"cc-design-sync"} */
"use strict";
var HangersCRM = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // hangers-crm/src/components/ui/index.ts
  var index_exports = {};
  __export(index_exports, {
    Badge: () => Badge,
    Button: () => Button,
    EmptyState: () => EmptyState,
    ErrorState: () => ErrorState,
    InlineLoader: () => InlineLoader,
    PageHeader: () => PageHeader,
    PaginationControls: () => PaginationControls,
    SkeletonCard: () => SkeletonCard,
    SkeletonLine: () => SkeletonLine,
    StatCard: () => StatCard,
    TableLoader: () => TableLoader
  });

  // hangers-crm/src/components/ui/Button.tsx
  var BASE = "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none";
  var VARIANTS = {
    primary: "bg-[#1a3c5e] text-white hover:bg-[#15304d] focus:ring-[#1a3c5e]",
    secondary: "bg-white text-[#1a3c5e] border border-[#d1dde8] hover:bg-[#f0f5fa] focus:ring-[#1a3c5e]",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
    ghost: "bg-transparent text-[#1a3c5e] hover:bg-[#f0f5fa] focus:ring-[#1a3c5e]"
  };
  var SIZES = {
    sm: "text-xs px-3 py-1.5",
    md: "text-sm px-4 py-2",
    lg: "text-base px-5 py-2.5"
  };
  function Button({
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    children,
    disabled,
    className = "",
    ...props
  }) {
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        className: `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`,
        disabled: disabled || loading,
        ...props
      },
      loading ? /* @__PURE__ */ React.createElement("svg", { className: "animate-spin h-4 w-4", viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React.createElement("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), /* @__PURE__ */ React.createElement("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8z" })) : icon,
      children
    );
  }

  // hangers-crm/src/components/ui/Badge.tsx
  var STATUS_COLORS = {
    PENDING: "#f59e0b",
    PICKED_UP: "#3b82f6",
    PROCESSING: "#8b5cf6",
    WASHING: "#06b6d4",
    DRYING: "#0ea5e9",
    IRONING: "#f97316",
    QC: "#a855f7",
    READY_FOR_DELIVERY: "#10b981",
    OUT_FOR_DELIVERY: "#14b8a6",
    DELIVERED: "#22c55e",
    CANCELLED: "#ef4444",
    RETURNED: "#f43f5e",
    SENT_TO_PLANT: "#6366f1",
    PAID: "#22c55e",
    PARTIAL: "#f59e0b",
    UNPAID: "#ef4444",
    ACTIVE: "#22c55e",
    PENDING_REVIEW: "#f59e0b",
    PAUSED: "#94a3b8",
    DRAFT: "#94a3b8",
    FINALIZED: "#3b82f6"
  };
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }
  function lightBg(hex) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},0.12)`;
  }
  function Badge({ label, color, status, size = "md" }) {
    const resolvedColor = color || (status ? STATUS_COLORS[status] : null) || "#64748b";
    const bg = lightBg(resolvedColor);
    const textSize = size === "sm" ? "0.65rem" : "0.72rem";
    return /* @__PURE__ */ React.createElement(
      "span",
      {
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: size === "sm" ? "2px 8px" : "3px 10px",
          borderRadius: 999,
          fontSize: textSize,
          fontWeight: 600,
          letterSpacing: "0.02em",
          backgroundColor: bg,
          color: resolvedColor,
          whiteSpace: "nowrap"
        }
      },
      /* @__PURE__ */ React.createElement(
        "span",
        {
          style: {
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: resolvedColor,
            flexShrink: 0
          }
        }
      ),
      label
    );
  }

  // hangers-crm/src/components/ui/StatCard.tsx
  function StatCard({ label, value, sub, trend, icon, loading = false }) {
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          background: "#fff",
          border: "1px solid #e8f0f7",
          borderRadius: 16,
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minWidth: 160,
          boxShadow: "0 1px 4px rgba(26,60,94,0.06)"
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", fontWeight: 600, color: "#64748b", letterSpacing: "0.04em", textTransform: "uppercase" } }, label), icon && /* @__PURE__ */ React.createElement("span", { style: { color: "#94a3b8", display: "flex" } }, icon)),
      loading ? /* @__PURE__ */ React.createElement("div", { style: { height: 36, background: "#f1f5f9", borderRadius: 8, animation: "pulse 1.5s ease-in-out infinite" } }) : /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.75rem", fontWeight: 700, color: "#1a3c5e", lineHeight: 1.1 } }, value),
      /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, trend && /* @__PURE__ */ React.createElement(
        "span",
        {
          style: {
            fontSize: "0.7rem",
            fontWeight: 600,
            color: trend.direction === "up" ? "#22c55e" : trend.direction === "down" ? "#ef4444" : "#94a3b8"
          }
        },
        trend.direction === "up" ? "\u2191" : trend.direction === "down" ? "\u2193" : "\u2192",
        " ",
        trend.label
      ), sub && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", color: "#94a3b8" } }, sub))
    );
  }

  // hangers-crm/src/components/ui/PageHeader.tsx
  function PageHeader({ title, subtitle, actions, breadcrumb }) {
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
          gap: 16,
          flexWrap: "wrap"
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, breadcrumb && breadcrumb.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.72rem", color: "#94a3b8", marginBottom: 4 } }, breadcrumb.join(" / ")), /* @__PURE__ */ React.createElement(
        "h1",
        {
          style: {
            margin: 0,
            fontSize: "1.4rem",
            fontWeight: 700,
            color: "#1a3c5e",
            lineHeight: 1.2
          }
        },
        title
      ), subtitle && /* @__PURE__ */ React.createElement("p", { style: { margin: "4px 0 0", fontSize: "0.82rem", color: "#64748b" } }, subtitle)),
      actions && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } }, actions)
    );
  }

  // hangers-crm/src/components/ui/EmptyState.tsx
  function EmptyState({ title, description, icon, action }) {
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
          gap: 16,
          textAlign: "center",
          color: "#94a3b8"
        }
      },
      icon ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: "2.5rem", opacity: 0.5 } }, icon) : /* @__PURE__ */ React.createElement("svg", { width: "48", height: "48", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", style: { opacity: 0.4 } }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /* @__PURE__ */ React.createElement("path", { d: "m21 21-4.35-4.35" })),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.95rem", fontWeight: 600, color: "#64748b", marginBottom: 4 } }, title), description && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.82rem" } }, description)),
      action && /* @__PURE__ */ React.createElement("div", null, action)
    );
  }

  // hangers-crm/src/components/ui/ErrorState.tsx
  function ErrorState({
    title = "Something went wrong",
    message = "Could not load data. Please try again.",
    onRetry
  }) {
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
          gap: 16,
          textAlign: "center"
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: { color: "#ef4444", fontSize: "2rem" } }, "\u26A0"),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.95rem", fontWeight: 600, color: "#1e293b", marginBottom: 4 } }, title), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.82rem", color: "#64748b" } }, message)),
      onRetry && /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: onRetry,
          style: {
            background: "#1a3c5e",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer"
          }
        },
        "Retry"
      )
    );
  }

  // hangers-crm/src/components/ui/Feedback.tsx
  function InlineLoader({ label = "Loading\u2026", tone = "default" }) {
    return /* @__PURE__ */ React.createElement("span", { className: `crm-inline-loader ${tone === "light" ? "crm-inline-loader-light" : ""}` }, /* @__PURE__ */ React.createElement("span", { className: "crm-spinner" }), /* @__PURE__ */ React.createElement("span", null, label));
  }
  function SkeletonLine({ width = "100%", height = 12, style }) {
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "crm-skeleton",
        style: { width, height, borderRadius: 999, ...style }
      }
    );
  }
  function SkeletonCard({ lines = 2 }) {
    return /* @__PURE__ */ React.createElement("div", { className: "crm-surface crm-skeleton-card" }, /* @__PURE__ */ React.createElement(SkeletonLine, { width: "38%", height: 10, style: { marginBottom: 14 } }), /* @__PURE__ */ React.createElement(SkeletonLine, { width: "55%", height: 30, style: { borderRadius: 14, marginBottom: 12 } }), Array.from({ length: lines }).map((_, index) => /* @__PURE__ */ React.createElement(
      SkeletonLine,
      {
        key: index,
        width: index === lines - 1 ? "48%" : "72%",
        height: 10,
        style: { marginBottom: index === lines - 1 ? 0 : 8 }
      }
    )));
  }
  function TableLoader({ rows = 5, columns = 4 }) {
    return /* @__PURE__ */ React.createElement("div", { style: { padding: 18 } }, Array.from({ length: rows }).map((_, rowIndex) => /* @__PURE__ */ React.createElement(
      "div",
      {
        key: rowIndex,
        style: {
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 12,
          padding: "14px 0",
          borderBottom: rowIndex === rows - 1 ? "none" : "1px solid #eef4f8"
        }
      },
      Array.from({ length: columns }).map((__, columnIndex) => /* @__PURE__ */ React.createElement(
        SkeletonLine,
        {
          key: columnIndex,
          width: columnIndex === 0 ? "72%" : columnIndex === columns - 1 ? "46%" : "58%",
          height: 12
        }
      ))
    )));
  }

  // hangers-crm/src/components/ui/PaginationControls.tsx
  function PaginationControls({
    page,
    pageSize,
    totalItems,
    itemLabel = "items",
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [10, 20, 30, 50, 100]
  }) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = totalItems === 0 ? 0 : Math.min(totalItems, currentPage * pageSize);
    if (totalItems <= 0) return null;
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: "#6b7fa3" } }, "Showing ", /* @__PURE__ */ React.createElement("strong", { style: { color: "#023c62" } }, start, "-", end), " of ", /* @__PURE__ */ React.createElement("strong", { style: { color: "#023c62" } }, totalItems), " ", itemLabel), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: 12, color: "#6b7fa3", display: "inline-flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", null, "Per page"), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: pageSize,
        onChange: (e) => onPageSizeChange(parseInt(e.target.value, 10)),
        style: { border: "1px solid #dce8f0", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "#fff", color: "#023c62" }
      },
      pageSizeOptions.map((option) => /* @__PURE__ */ React.createElement("option", { key: option, value: option }, option))
    )), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => onPageChange(currentPage - 1),
        disabled: currentPage <= 1,
        style: { padding: "8px 12px", border: "1px solid #dce8f0", borderRadius: 8, fontSize: 13, background: "#fff", color: "#023c62", cursor: currentPage <= 1 ? "not-allowed" : "pointer", opacity: currentPage <= 1 ? 0.45 : 1 }
      },
      "Prev"
    ), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 72, textAlign: "center", fontSize: 13, color: "#023c62", fontWeight: 700 } }, currentPage, " / ", totalPages), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => onPageChange(currentPage + 1),
        disabled: currentPage >= totalPages,
        style: { padding: "8px 12px", border: "1px solid #dce8f0", borderRadius: 8, fontSize: 13, background: "#fff", color: "#023c62", cursor: currentPage >= totalPages ? "not-allowed" : "pointer", opacity: currentPage >= totalPages ? 0.45 : 1 }
      },
      "Next"
    )));
  }
  return __toCommonJS(index_exports);
})();
window.HangersCRM=HangersCRM.__dsMainNs?Object.assign({},HangersCRM,HangersCRM.__dsMainNs,{__dsMainNs:undefined}):HangersCRM;
