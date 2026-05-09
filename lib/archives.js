// lib/archives.js - Date-based archive functionality

const fs = require('fs');
const log = require('./logger');
const path = require('path');
const templates = require('./templates');
const siteConfig = require('./site-config');
const { hasCategory } = require('./helpers');

/**
 * Organize posts by date
 * @param {Array} pages All pages
 * @returns {Object} Object with dates organized by year, month, day
 */
function getPostsByDate(pages) {
  const articlePages = pages.filter(page =>
    hasCategory(page.meta.category, 'article')
  );

  const postsByDate = { years: {}, months: {}, days: {} };

  log.log(`Organizing ${articlePages.length} pages by date…`);
  let pageCount = 0;

  articlePages.forEach(page => {
    if (!page.meta.saved_date) return;

    const date = new Date(page.meta.saved_date);
    if (isNaN(date.getTime())) return;

    pageCount++;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const yearKey = `${year}`;
    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
    const dayKey = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

    if (!postsByDate.years[yearKey]) postsByDate.years[yearKey] = [];
    if (!postsByDate.months[monthKey]) postsByDate.months[monthKey] = [];
    if (!postsByDate.days[dayKey]) postsByDate.days[dayKey] = [];

    postsByDate.years[yearKey].push(page);
    postsByDate.months[monthKey].push(page);
    postsByDate.days[dayKey].push(page);
  });

  log.log(`Found ${pageCount} article pages with valid dates`);
  log.log(`Year keys: ${Object.keys(postsByDate.years).join(', ')}`);
  log.log(`Total month keys: ${Object.keys(postsByDate.months).length}`);

  Object.keys(postsByDate.years).forEach(year => {
    postsByDate.years[year].sort((a, b) => new Date(b.meta.saved_date) - new Date(a.meta.saved_date));
  });
  Object.keys(postsByDate.months).forEach(month => {
    postsByDate.months[month].sort((a, b) => new Date(b.meta.saved_date) - new Date(a.meta.saved_date));
  });
  Object.keys(postsByDate.days).forEach(day => {
    postsByDate.days[day].sort((a, b) => new Date(b.meta.saved_date) - new Date(a.meta.saved_date));
  });

  return postsByDate;
}

/**
 * Get the column name for a page based on its path
 * @param {Object} page Page object
 * @returns {string|null} Column name or null if not a column post
 */
function getColumnForPage(page) {
  const match = page.path.match(/^\/columns\/([^/]+)\//);
  return match ? match[1] : null;
}

/**
 * Get legacy year folders for a column from the build directory
 * @param {string} buildDir Output directory
 * @param {string} columnName Column name
 * @returns {Array} Sorted array of year strings
 */
function getLegacyYearsForColumn(buildDir, columnName) {
  const columnDir = path.join(buildDir, 'columns', columnName);
  if (!fs.existsSync(columnDir)) return [];

  return fs.readdirSync(columnDir)
    .filter(entry => {
      const entryPath = path.join(columnDir, entry);
      return /^\d{4}$/.test(entry) && fs.statSync(entryPath).isDirectory();
    })
    .sort((a, b) => b - a);
}

/**
 * Generate all date-based archives scoped to columns
 * @param {Array} pages All pages
 * @param {Object} postsByDate Posts organized by date
 * @param {string} buildDir Output directory
 */
function generateDateArchives(pages, postsByDate, buildDir) {
  log.log('Generating date archives…');

  // Group CMS pages by column
  const columnPages = {};
  pages.forEach(page => {
    const col = getColumnForPage(page);
    if (col && page.meta.saved_date) {
      if (!columnPages[col]) columnPages[col] = [];
      columnPages[col].push(page);
    }
  });

  // For each column, generate an index page listing all years (CMS + legacy)
  Object.keys(columnPages).forEach(columnName => {
    const colPages = columnPages[columnName];
    const colDir = path.join(buildDir, 'columns', columnName);

    const legacyYears = getLegacyYearsForColumn(buildDir, columnName);
    const configYears = (siteConfig.columns[columnName] && siteConfig.columns[columnName].archiveYears || []).map(String);
    const cmsYears = [...new Set(colPages.map(p => new Date(p.meta.saved_date).getFullYear().toString()))]
      .sort((a, b) => b - a);
    const excludeYears = new Set(((siteConfig.columns[columnName] && siteConfig.columns[columnName].excludeYears) || []).map(String));
    const allYears = [...new Set([...cmsYears, ...legacyYears, ...configYears])]
      .filter(y => !excludeYears.has(y))
      .sort((a, b) => b - a);

    log.log(`Column '${columnName}': CMS years [${cmsYears.join(', ')}], legacy years [${legacyYears.join(', ')}]`);

    // Build the years data (shared by both the archives page and index)
    const yearsData = allYears.map(year => {
          const isCms = cmsYears.includes(year);
          const colConfig = siteConfig.columns[columnName] || {};
          const archiveMonths = (colConfig.archiveMonths && colConfig.archiveMonths[parseInt(year)]) || [];
          const archiveMonthUrls = (colConfig.archiveMonthUrls && colConfig.archiveMonthUrls[parseInt(year)]) || {};

          // CMS months for this year
          const cmsMonthNums = isCms
            ? Object.keys(postsByDate.months)
                .filter(k => k.startsWith(year + '-') && postsByDate.months[k].some(p => getColumnForPage(p) === columnName))
                .map(k => parseInt(k.split('-')[1]))
            : [];

          const activeMonths = [...new Set([...cmsMonthNums, ...archiveMonths])];

          // Build full 12-month grid
          const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const monthGrid = monthNames.map((name, i) => {
            const monthNum = i + 1;
            const hasContent = activeMonths.includes(monthNum);
            const pad = monthNum.toString().padStart(2, '0');
            const overrideUrl = archiveMonthUrls[monthNum] ? `${siteConfig.archiveUrl}${archiveMonthUrls[monthNum]}` : null;
            const defaultUrl = isCms
              ? `/columns/${columnName}/${year}/${pad}/`
              : `${siteConfig.archiveUrl}/columns/${columnName}/${year}/${pad}/`;
            return {
              name,
              num: monthNum,
              hasContent,
              isCms: cmsMonthNums.includes(monthNum),
              url: hasContent ? (overrideUrl || defaultUrl) : null
            };
          });

          return {
            year,
            isCms,
            isLegacy: legacyYears.includes(year),
            posts: postsByDate.years[year] ? postsByDate.years[year].filter(p => getColumnForPage(p) === columnName) : [],
            url: isCms ? `/columns/${columnName}/${year}/` : `${siteConfig.archiveUrl}/columns/${columnName}/${year}/`,
            monthGrid
          };
        });

    // ── Archives page (year grid) → /columns/<name>/archives/index.html ──
    const archivesDir = path.join(colDir, 'archives');
    if (!fs.existsSync(archivesDir)) fs.mkdirSync(archivesDir, { recursive: true });

    const colArchivePage = {
      path: `/columns/${columnName}/archives`,
      meta: {
        title: (siteConfig.columns[columnName] && siteConfig.columns[columnName].title) || columnName.toUpperCase(),
        description: (siteConfig.columns[columnName] && siteConfig.columns[columnName].description) || `Posts from the ${columnName} column`,
        template: 'archives',
        columnName: columnName,
        sortOrder: 'desc',
        years: yearsData
      },
      content: '',
      isDraft: false,
      isPublished: true,
      generated: true
    };

    const colArchiveHtml = templates.generatePageHtml(colArchivePage, pages, null, postsByDate);
    fs.writeFileSync(path.join(archivesDir, 'index.html'), colArchiveHtml);

    // ── Column index (recent posts) → /columns/<name>/index.html ──
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const recentPosts = colPages
      .filter(p => p.meta.saved_date && new Date(p.meta.saved_date) >= sixMonthsAgo)
      .sort((a, b) => new Date(b.meta.saved_date) - new Date(a.meta.saved_date))
      .slice(0, 7);

    const colIndexPage = {
      path: `/columns/${columnName}`,
      meta: {
        title: (siteConfig.columns[columnName] && siteConfig.columns[columnName].title) || columnName.toUpperCase(),
        description: (siteConfig.columns[columnName] && siteConfig.columns[columnName].description) || `Posts from the ${columnName} column`,
        template: 'column-index',
        columnName: columnName,
        recentPosts
      },
      content: '',
      isDraft: false,
      isPublished: true,
      generated: true
    };

    const colIndexHtml = templates.generatePageHtml(colIndexPage, pages, null, postsByDate);
    fs.writeFileSync(path.join(colDir, 'index.html'), colIndexHtml);
  });

  // Generate year/month/day archives scoped to each column
  const years = Object.keys(postsByDate.years).sort((a, b) => b - a);

  years.forEach((year, yearIndex) => {
    const yearPages = postsByDate.years[year];
    const columnNames = [...new Set(yearPages.map(p => getColumnForPage(p)).filter(Boolean))];

    columnNames.forEach(columnName => {
      const colYearPages = yearPages.filter(p => getColumnForPage(p) === columnName);
      const yearDir = path.join(buildDir, 'columns', columnName, year);

      if (!fs.existsSync(yearDir)) fs.mkdirSync(yearDir, { recursive: true });

      // Get adjacent years for this column
      const colYears = years.filter(y =>
        postsByDate.years[y].some(p => getColumnForPage(p) === columnName)
      );
      const colYearIndex = colYears.indexOf(year);
      const prevYear = colYearIndex < colYears.length - 1 ? colYears[colYearIndex + 1] : null;
      const nextYear = colYearIndex > 0 ? colYears[colYearIndex - 1] : null;

      const yearPage = {
        path: `/columns/${columnName}/${year}`,
        meta: {
          title: `${year}`,
          description: `Posts from ${year} in the ${columnName} column`,
          template: 'year-archives',
          year,
          columnName,
          prevYear,
          nextYear,
          months: getMonthsForColumnYear(postsByDate, year, columnName)
        },
        content: '',
        isDraft: false,
        isPublished: true,
        generated: true
      };

      const yearHtml = templates.generatePageHtml(yearPage, pages, null, postsByDate);
      fs.writeFileSync(path.join(yearDir, 'index.html'), yearHtml);

      // Month archives
      const monthKeys = Object.keys(postsByDate.months)
        .filter(key => key.startsWith(year + '-') && postsByDate.months[key].some(p => getColumnForPage(p) === columnName))
        .sort((a, b) => b.localeCompare(a));

      monthKeys.forEach((monthKey, monthIndex) => {
        const [, month] = monthKey.split('-');
        const monthDir = path.join(yearDir, month.toString().padStart(2, '0'));
        if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });

        const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const monthName = monthDate.toLocaleString('default', { month: 'long' });

        const prevMonthKey = monthIndex < monthKeys.length - 1 ? monthKeys[monthIndex + 1] : null;
        const nextMonthKey = monthIndex > 0 ? monthKeys[monthIndex - 1] : null;

        const buildMonthNav = (key) => {
          if (!key) return null;
          const [y, m] = key.split('-');
          const d = new Date(parseInt(y), parseInt(m) - 1, 1);
          return { year: y, month: m, name: d.toLocaleString('default', { month: 'long' }) };
        };

        const monthPage = {
          path: `/columns/${columnName}/${year}/${month.toString().padStart(2, '0')}`,
          meta: {
            title: `${monthName} ${year}`,
            description: `Posts from ${monthName} ${year} in the ${columnName} column`,
            template: 'month-archives',
            year,
            month,
            monthName,
            columnName,
            prevMonth: buildMonthNav(prevMonthKey),
            nextMonth: buildMonthNav(nextMonthKey),
            days: getDaysForColumnMonth(postsByDate, year, month, columnName)
          },
          content: '',
          isDraft: false,
          isPublished: true,
          generated: true
        };

        const monthHtml = templates.generatePageHtml(monthPage, pages, null, postsByDate);
        fs.writeFileSync(path.join(monthDir, 'index.html'), monthHtml);

        // Day archives
        const dayKeys = Object.keys(postsByDate.days)
          .filter(key => key.startsWith(monthKey + '-') && postsByDate.days[key].some(p => getColumnForPage(p) === columnName))
          .sort((a, b) => b.localeCompare(a));

        dayKeys.forEach((dayKey, dayIndex) => {
          const [, , day] = dayKey.split('-');
          const dayDir = path.join(monthDir, day.toString().padStart(2, '0'));
          if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });

          const dayPosts = postsByDate.days[dayKey].filter(p => getColumnForPage(p) === columnName);
          const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          const formattedDate = dateObj.toLocaleDateString('default', { year: 'numeric', month: 'long', day: 'numeric' });

          const prevDayKey = dayIndex < dayKeys.length - 1 ? dayKeys[dayIndex + 1] : null;
          const nextDayKey = dayIndex > 0 ? dayKeys[dayIndex - 1] : null;

          const buildDayNav = (key) => {
            if (!key) return null;
            const [y, m, d] = key.split('-');
            const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            return { year: y, month: m, day: d, formatted: dt.toLocaleDateString('default', { month: 'long', day: 'numeric' }) };
          };

          const symlinkPath = path.join(dayDir, 'index.html');

          if (dayPosts.length === 1) {
            // Single post — symlink the day URL directly to the post file
            const postFilename = path.basename(dayPosts[0].path) + '.html';
            if (fs.existsSync(symlinkPath)) fs.unlinkSync(symlinkPath);
            fs.symlinkSync(postFilename, symlinkPath);
          } else {
            const dayPage = {
              path: `/columns/${columnName}/${year}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`,
              meta: {
                title: formattedDate,
                description: `Posts from ${formattedDate} in the ${columnName} column`,
                template: 'day-archives',
                year, month, day,
                formattedDate,
                monthName,
                columnName,
                prevDay: buildDayNav(prevDayKey),
                nextDay: buildDayNav(nextDayKey),
                posts: dayPosts
              },
              content: '',
              isDraft: false,
              isPublished: true,
              generated: true
            };

            if (fs.existsSync(symlinkPath) && fs.lstatSync(symlinkPath).isSymbolicLink()) {
              fs.unlinkSync(symlinkPath);
            }
            const dayHtml = templates.generatePageHtml(dayPage, pages, null, postsByDate);
            fs.writeFileSync(symlinkPath, dayHtml);
          }
        });
      });
    });
  });

  log.log('Date archives generated');
}

/**
 * Extract months data for a column year archive
 */
function getMonthsForColumnYear(postsByDate, year, columnName) {
  return Object.keys(postsByDate.months)
    .filter(key => key.startsWith(year + '-') && postsByDate.months[key].some(p => getColumnForPage(p) === columnName))
    .sort((a, b) => b.localeCompare(a))
    .map(monthKey => {
      const [, month] = monthKey.split('-');
      return { month, posts: postsByDate.months[monthKey].filter(p => getColumnForPage(p) === columnName) };
    });
}

/**
 * Extract days data for a column month archive
 */
function getDaysForColumnMonth(postsByDate, year, month, columnName) {
  const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
  return Object.keys(postsByDate.days)
    .filter(key => key.startsWith(monthKey + '-') && postsByDate.days[key].some(p => getColumnForPage(p) === columnName))
    .sort((a, b) => b.localeCompare(a))
    .map(dayKey => {
      const [, , day] = dayKey.split('-');
      return { day, posts: postsByDate.days[dayKey].filter(p => getColumnForPage(p) === columnName) };
    });
}

/**
 * Extract years data for archive navigation (kept for backwards compatibility)
 */
function getYearsForArchive(postsByDate, sortOrder = 'desc') {
  let years = Object.keys(postsByDate.years);
  years = sortOrder === 'asc' ? years.sort((a, b) => a - b) : years.sort((a, b) => b - a);

  return years.map(year => {
    let monthKeys = Object.keys(postsByDate.months)
      .filter(key => key.startsWith(year + '-'));
    monthKeys = sortOrder === 'asc'
      ? monthKeys.sort((a, b) => a.localeCompare(b))
      : monthKeys.sort((a, b) => b.localeCompare(a));

    const months = monthKeys.map(monthKey => {
      const [, month] = monthKey.split('-');
      const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      return { month, name: monthDate.toLocaleString('default', { month: 'long' }), posts: postsByDate.months[monthKey] };
    });

    return { year, posts: postsByDate.years[year], months };
  });
}

/**
 * Extract months data for year archive (kept for backwards compatibility)
 */
function getMonthsForYear(postsByDate, year) {
  return Object.keys(postsByDate.months)
    .filter(key => key.startsWith(year + '-'))
    .sort((a, b) => b.localeCompare(a))
    .map(monthKey => {
      const [, month] = monthKey.split('-');
      return { month, posts: postsByDate.months[monthKey] };
    });
}

/**
 * Extract days data for month archive (kept for backwards compatibility)
 */
function getDaysForMonth(postsByDate, year, month) {
  const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
  return Object.keys(postsByDate.days)
    .filter(key => key.startsWith(monthKey + '-'))
    .sort((a, b) => b.localeCompare(a))
    .map(dayKey => {
      const [, , day] = dayKey.split('-');
      return { day, posts: postsByDate.days[dayKey] };
    });
}

module.exports = {
  getPostsByDate,
  generateDateArchives,
  getColumnForPage,
  getLegacyYearsForColumn,
  getYearsForArchive,
  getMonthsForYear,
  getDaysForMonth
};
