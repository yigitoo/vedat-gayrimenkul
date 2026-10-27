const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../db');
const { requireWebAuth } = require('../utils/webAuth');
const { annualReport, combinedReport, fullMonthReport, monthReport, rangeReport } = require('../services/reportData');
const busService = require('../services/bus');
const {
  buildAnnualReportPdf,
  buildBusMonthReportPdf,
  buildBusPeriodReportPdf,
  buildCombinedReportPdf,
  buildFullMonthReportPdf,
  buildMonthReportPdf,
  buildRangeReportPdf,
  fileNameFor,
} = require('../utils/pdfReport');
const {
  buildAnnualPaymentsWorkbook,
  buildMonthPaymentsWorkbook,
  fileNameForExcel,
} = require('../utils/excelReport');
const { parsePeriod } = require('../utils/api');

function streamPdf(res, doc, fileName) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
  res.setHeader('Cache-Control', 'no-store');
  doc.pipe(res);
  doc.end();
}

async function streamExcel(res, workbook, fileName) {
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).end(Buffer.from(buffer));
}

/* Aylık bütün rapor: "kind=full" ya da "scope=full" ikisi de kabul. */
function isFull(source = {}) {
  return String(source.scope || source.kind || '') === 'full';
}

/* POST · aylık bütün raporu seçilen ay için şimdi e-postayla gönder.
   Gövde: { kind: 'full', action: 'email', month, year }. */
async function handlePost(req, res) {
  const body = req.body || {};
  const action = String(body.action || 'email');
  if (!isFull(body) || action !== 'email') {
    return res.status(400).json({ error: 'Desteklenmeyen rapor işlemi.' });
  }
  const { month, year } = parsePeriod(body);
  const { sendFullMonthReport } = require('../services/monthlyReport');
  const result = await sendFullMonthReport({ month, year, source: 'web' });
  const { message, ...rest } = result;
  return res.status(result.sent ? 200 : 503).json(rest);
}

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireWebAuth(req, res)) return;

  try {
    if (mongoose.connection.readyState !== 1) await connectDB();

    if (req.method === 'POST') return await handlePost(req, res);

    const wantsPdf = String(req.query.format || '') === 'pdf';
    const wantsExcel = ['xlsx', 'excel'].includes(String(req.query.format || '').toLowerCase());
    const scope = isFull(req.query) ? 'full' : String(req.query.scope || 'range');

    if (scope === 'full') {
      const { month, year } = parsePeriod(req.query);
      const report = await fullMonthReport(month, year);
      if (!wantsPdf) return res.status(200).json(report);
      return streamPdf(res, buildFullMonthReportPdf(report), fileNameFor('full', year, month));
    }

    if (scope === 'bus') {
      const { month, year } = parsePeriod(req.query);
      const report = await busService.monthReport({ month, year, busId: String(req.query.busId || '') });
      if (!wantsPdf) return res.status(200).json(report);
      return streamPdf(res, buildBusMonthReportPdf(report), fileNameFor('bus', year, month));
    }

    if (scope === 'bus-period') {
      const busId = String(req.query.busId || '');
      const report = await busService.periodReport({
        start: req.query.start,
        end: req.query.end,
        busId: mongoose.isValidObjectId(busId) ? busId : '',
      });
      if (!wantsPdf) return res.status(200).json(report);
      return streamPdf(
        res,
        buildBusPeriodReportPdf(report),
        fileNameFor('bus-period', report.startDate, report.endDate)
      );
    }

    if (scope === 'combined') {
      const requested = Number(req.query.months);
      const months = Number.isInteger(requested) && requested >= 3 && requested <= 24 ? requested : 12;
      const report = await combinedReport(months);
      if (!wantsPdf) return res.status(200).json(report);
      return streamPdf(res, buildCombinedReportPdf(report), fileNameFor('combined', months));
    }

    if (scope === 'month') {
      const { month, year } = parsePeriod(req.query);
      const report = await monthReport(month, year);
      if (!wantsPdf && !wantsExcel) return res.status(200).json(report);
      if (wantsPdf) return streamPdf(res, buildMonthReportPdf(report), fileNameFor('month', year, month));
      return streamExcel(res, buildMonthPaymentsWorkbook(report), fileNameForExcel('month', year, month));
    }

    if (scope === 'annual') {
      const currentYear = new Date().getFullYear();
      const requested = Number(req.query.year);
      const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100
        ? requested
        : currentYear;

      const annual = await annualReport(year);
      if (!wantsPdf && !wantsExcel) return res.status(200).json(annual);
      if (wantsPdf) return streamPdf(res, buildAnnualReportPdf(annual), fileNameFor('annual', year));
      return streamExcel(res, buildAnnualPaymentsWorkbook(annual), fileNameForExcel('annual', year));
    }

    const requested = Number(req.query.months);
    const monthCount = Number.isInteger(requested) && requested >= 3 && requested <= 24 ? requested : 12;
    const report = await rangeReport(monthCount, {
      startDate: req.query.start,
      endDate: req.query.end,
    });

    if (!wantsPdf) return res.status(200).json(report);
    const fileName = report.startDate && report.endDate
      ? `vedat-gayrimenkul-${report.startDate}-${report.endDate}.pdf`
      : fileNameFor('range', report.months);
    return streamPdf(res, buildRangeReportPdf(report), fileName);
  } catch (error) {
    console.error('Reports API error:', error);
    const status = error.code === 'INVALID_REPORT_RANGE' ? 400 : 500;
    return res.status(status).json({ error: status === 400 ? error.message : 'Rapor verisi alınamadı.' });
  }
};
