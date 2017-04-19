/*jshint esversion: 6 */

const GitHubApi = require('github'),
      _ = require('lodash'),
      moment = require('moment');

const {
  owner,
  repo,
  githubApiToken,
  numIssuesPerPerson,
  numIssuesToPickFrom,
  assignees,
  additionalQueryParams,
  labelsToAdd = [],
  message,
  numDaysOld = 0,
  verbose = true,
  dryRun = true // Safer to force you to turn it on
} = require('./config.json');

const makeLogger = (verbose) => {
  return {
    log: console.log,
    debug: (...args) => {
      if (verbose) {
        console.log(...args);
      }
    }
  };
};
const logger = makeLogger(verbose);

const assignmentMessage = (message, assignee) =>
  message.replace(new RegExp(/@@/, 'g'), '@' + assignee);

const fetchIssuesBatch = 100;

const github = new GitHubApi({
  protocol: 'https',
  host: 'api.github.com',
  headers: {
    'user-agent': 'github-issue-roulette',
  }
});

github.authenticate({
    type: 'token',
    token: githubApiToken
});

const createComment = (number, message, assignee) => {
  if (dryRun) {
    logger.debug(`DRYRUN: would comment on ${number} for ${assignee}:`,
      assignmentMessage(message, assignee));
    return Promise.resolve();
  } else {
    return github.issues.createComment({
      owner: owner,
      repo: repo,
      number: number,
      body: assignmentMessage(message, assignee)
    }).then(() => {
      logger.debug(`Commented on ${number}`);
    });
  }
};

const assignIssue = (number, assignee) => {
  if (dryRun) {
    logger.debug(`DRYRUN: would assign ${number} to ${assignee}`);
    return Promise.resolve();
  } else {
    return github.issues.addAssigneesToIssue({
      owner: owner,
      repo: repo,
      number: number,
      assignees: [assignee]
    }).then(() => {
      logger.debug(`Assigned ${number} to ${assignee}`);
    });
  }
};

const addLabels = (number) => {
  if (dryRun) {
    logger.debug(`DRYRUN: would have added ${labelsToAdd} to ${number}`);
    return Promise.resolve();
  } else {
    return github.issues.addLabels({
      owner: owner,
      repo: repo,
      number: number,
      labels: labelsToAdd,
      body: {}
    }).then(() => {
      logger.debug(`Added ${labelsToAdd} to ${number}`);
    });
  }
};

const getOldestNIssues = (maxIssuesWanted, issues=[], page=1) => {
  logger.debug(`Fetching ${issues.length}-${issues.length + fetchIssuesBatch} issues…`);

  return github.search.issues({
    q: ['is:open is:issue no:milestone no:assignee',
        `updated:<${cutoffDate}`,
        `repo:${owner}/${repo}`,
        additionalQueryParams].join(' '),

    sort: 'updated',
    order: 'asc',

    per_page: fetchIssuesBatch,
    page: page
  }).then(results => {
    results = results.data.items; // unbox search results from probably useful metadata
    issues = issues.concat(results);

    if (results.length < fetchIssuesBatch) {
      // Got all the issues
      return issues;
    } else if (maxIssuesWanted && issues.length >= maxIssuesWanted) {
      // Got all the issues that we wanted to get
      return _.take(issues, maxIssuesWanted);
    } else {
      // Need to get more issues
      return getOldestNIssues(maxIssuesWanted, issues, page + 1);
    }
  });
};

const getAllIssues = () => getOldestNIssues();

// FLOW STARTS HERE

if (dryRun) {
  logger.log('Dry-run enabled!');
}

const cutoffDate = moment().subtract(numDaysOld, 'd').format('YYYY-MM-DD');
logger.debug(`Getting issues that haven't been touched since ${cutoffDate}`);

const pickedIssues = [];

getOldestNIssues(numIssuesToPickFrom).then(results => {
  logger.log(`Found ${results.length} un-dealt-with issues in ${owner}/${repo}`);

  if (assignees.length * numIssuesPerPerson > results.length) {
    logger.log(`Not enough open issues in ${owner}/${repo} for issue roulette! Congratulations!`);
    return;
  }

  const shuffledIssues = _.shuffle(results);

  const promises = [];

  const issuePromise = (issue, assignee) =>
    assignIssue(issue.number, assignee)
    .then(() => addLabels(issue.number, labelsToAdd))
    .then(() => {
      if (message) {
        return createComment(issue.number, message, assignee);
      }
    }).then(() => {
      logger.log(`${issue.number} assigned to ${assignee}${labelsToAdd.length ? ', labeled' : ''}${message ? ', commented' : ''}.`);
    });

  for (const assignee of assignees) {
    const tissues = shuffledIssues.splice(0, numIssuesPerPerson);
    for (const issue of tissues) {
      logger.debug(`Assigning #${issue.number} to ${assignee}`);
      logger.debug(issue.title);
      logger.debug(issue.html_url);
      logger.debug(`Last updated: ${issue.updated_at}`);
      pickedIssues.push(issue);
      promises.push(issuePromise(issue, assignee));

      logger.debug();
    }
  }

  return Promise.all(promises);
}).then(() => {
  logger.debug(`List of issues that we attempted to modify (check log for what actually happened):\n ${pickedIssues.map(issue => issue.number)}\n`);
  logger.log(`All done!`);
}).catch(e => {
  logger.log(e);
});
