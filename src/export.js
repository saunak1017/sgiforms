import { LABELS, STONES, LOTS, PROCESS, usedRows } from "./schema";
export async function exportRecord(record, format) {
  const d = record.data,
    title =
      d.kind === "jewelry"
        ? "Customer/Special Jewelry Order Form"
        : "Vendor Memo In";
  const rows = Object.entries(LABELS)
    .filter(
      ([k]) =>
        d[k] !== undefined &&
        d[k] !== "" &&
        (!Array.isArray(d[k]) || d[k].length),
    )
    .map(([k, l]) => [
      l,
      Array.isArray(d[k])
        ? d[k].join(", ")
        : typeof d[k] === "boolean"
          ? d[k]
            ? "Yes"
            : "No"
          : String(d[k]),
    ]);
  rows.unshift(
    ["Reference", record.id],
    ["Status", record.status],
    ["Created by", record.created_by || ""],
    ["Last saved", record.updated_at || ""],
  );
  if (record.original_submission)
    rows.unshift(
      ["Version", "Original submitted form"],
      ["Submitted by", record.submitted_by],
      ["Submitted at", record.submitted_at],
    );
  const cols = d.kind === "jewelry" ? STONES : LOTS,
    stones = d.noStones
      ? []
      : usedRows(d).map((r) => cols.map(([k]) => String(r[k] ?? "")));
  const process =
    d.kind === "jewelry"
      ? PROCESS.map(([k, l]) => [
          l,
          d.processing?.[k]?.by || "",
          d.processing?.[k]?.date || "",
        ])
      : [
          ["Vendor Memo In Completed", d.completed ? "Yes" : "No", ""],
          ["Entered By", d.completedBy || "", d.completedDate || ""],
        ];
  if (format === "pdf") {
    const { jsPDF } = await import("jspdf");
    const { autoTable } = await import("jspdf-autotable");
    const pdf = new jsPDF();
    for (const [filename, style] of [
      ["DejaVuSans.ttf", "normal"],
      ["DejaVuSans-Bold.ttf", "bold"],
    ]) {
      const response = await fetch(`/fonts/${filename}`);
      if (!response.ok)
        throw new Error("Could not load the PDF font. Please retry.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      pdf.addFileToVFS(filename, btoa(binary));
      pdf.addFont(filename, "SGI", style);
    }
    pdf.setFont("SGI", "normal");
    pdf.setFontSize(16);
    pdf.text(title, 14, 20);
    autoTable(pdf, {
      startY: 28,
      head: [["Field", "Information"]],
      body: rows,
      styles: { font: "SGI", fontSize: 9, overflow: "linebreak" },
      headStyles: { fillColor: [35, 51, 47] },
    });
    let processingY = pdf.lastAutoTable.finalY + 12;
    if (processingY > 200) {
      pdf.addPage("a4", "portrait");
      processingY = 20;
    }
    pdf.setFontSize(14);
    pdf.text("Order Processing", 14, processingY);
    autoTable(pdf, {
      startY: processingY + 7,
      head: [["Step", "Name / Number", "Date"]],
      body: process,
      styles: { font: "SGI", fontSize: 10 },
      headStyles: { fillColor: [35, 51, 47] },
    });
    if (stones.length) {
      pdf.addPage("a4", "landscape");
      pdf.setFontSize(14);
      pdf.text(
        d.kind === "jewelry" ? "Stone Information" : "Vendor Lots",
        14,
        18,
      );
      autoTable(pdf, {
        startY: 24,
        head: [cols.map((x) => x[1])],
        body: stones,
        styles: { font: "SGI", fontSize: 8, overflow: "linebreak" },
        headStyles: { fillColor: [35, 51, 47] },
      });
    }
    pdf.save(
      `${d.kind}-${record.id.slice(0, 8)}${record.original_submission ? "-submitted" : ""}.pdf`,
    );
  } else {
    const {
      Document,
      Packer,
      Paragraph,
      Table,
      TableRow,
      TableCell,
      TextRun,
      WidthType,
      PageOrientation,
      BorderStyle,
    } = await import("docx");
    const para = (t) =>
      new Paragraph({
        children: [new TextRun(String(t))],
        spacing: { after: 45 },
      });
    const table = (heads, body) =>
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: Object.fromEntries(
          [
            "top",
            "bottom",
            "left",
            "right",
            "insideHorizontal",
            "insideVertical",
          ].map((k) => [
            k,
            { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
          ]),
        ),
        rows: [heads, ...body].map(
          (row, i) =>
            new TableRow({
              tableHeader: i === 0,
              children: row.map(
                (t) =>
                  new TableCell({
                    children: [para(t)],
                    margins: { top: 60, bottom: 60, left: 90, right: 90 },
                    shading: i === 0 ? { fill: "E6EBE8" } : undefined,
                  }),
              ),
            }),
        ),
      });
    const sections = [
      {
        children: [
          new Paragraph({ text: title, heading: "Title" }),
          table(["Field", "Information"], rows),
          new Paragraph({
            text: "Order Processing",
            heading: "Heading1",
            spacing: { before: 200, after: 100 },
          }),
          table(["Step", "Name / Number", "Date"], process),
        ],
      },
    ];
    if (stones.length)
      sections.push({
        properties: {
          page: { size: { orientation: PageOrientation.LANDSCAPE } },
        },
        children: [
          new Paragraph({
            text: d.kind === "jewelry" ? "Stone Information" : "Vendor Lots",
            heading: "Heading1",
          }),
          table(
            cols.map((x) => x[1]),
            stones,
          ),
        ],
      });
    const blob = await Packer.toBlob(
      new Document({
        styles: {
          default: {
            document: { run: { font: "Arial", size: 20, color: "000000" } },
            title: { run: { font: "Arial", size: 32, color: "000000" } },
            heading1: {
              run: { font: "Arial", size: 26, color: "000000" },
              paragraph: { spacing: { before: 200, after: 100 } },
            },
          },
        },
        sections: sections.map((section) => ({
          ...section,
          properties: {
            ...section.properties,
            page: {
              ...section.properties?.page,
              margin: { top: 720, bottom: 720, left: 720, right: 720 },
            },
          },
        })),
      }),
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${d.kind}-${record.id.slice(0, 8)}.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}
