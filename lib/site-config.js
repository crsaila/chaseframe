const siteConfig = {
  siteName: 'My Site',
  siteUrl: 'https://example.com/',
  siteTagline: 'A short description of your site',
  siteDescription: 'A longer description used in meta tags and RSS feeds.',
  siteStyle: '',

  authorName: 'Your Name',
  authorBio: '',

  socialMain: '',
  socialMainUrl: '',
  social: {
    mastodon: '',
    mastodonUrl: '',
    github: '',
    githubUrl: '',
    linkedin: '',
    linkedinUrl: '',
  },

  copyright: {
    startYear: new Date().getFullYear(),
    license: 'CC BY-SA 4.0',
    licenseUrl: 'http://creativecommons.org/licenses/by-sa/4.0/'
  },

  navigation: [
    { label: 'Home', path: '/', title: 'Homepage' },
    { label: 'Topics', path: '/topics/', title: 'Browse by topic' },
    { label: 'About', path: '/about/', title: 'About this site' }
  ],

  location: '',
  locationUrl: '',

  googleAnalyticsId: '',
  disqusShortname: '',

  // Add columns here. Each key matches the directory name under content/columns/.
  // columns: {
  //   blog: {
  //     title: 'My Blog',
  //     description: 'Periodic notes on things',
  //     archiveYears: [],
  //     excludeYears: [],
  //     archiveMonths: {},
  //     archiveMonthUrls: {}
  //   }
  // },
  columns: {},

  hiddenTopics: [],
  topicAliases: {},

  archiveUrl: process.env.ARCHIVE_URL || '',

  features: {
    enableComments: false,
    enableSearch: false,
    enableDarkMode: false
  }
};

module.exports = siteConfig;
