/*jshint esversion: 6 */

const GitHubApi = require('github'),
      _ = require('lodash'),
      moment = require('moment');

/* This file isn't commited into Git. It should just look like this:
 *
 *  {
 *    "githubApiToken": "..."
 *  }
 *
 * Where githubApiToken is generated here: https://github.com/settings/tokens
 */
const { githubApiToken } = require('./token.json');

const {
  owner,
  repo,
  numIssuesPerPerson,
  assignees,
  ancient: {
    numDaysOld,
    message: ancientMessage,
    additionalQueryParams,
    labelsToAdd: ancientLabelsToAdd
  },
  unlabeled: {
    expectedLabels,
    message: unlabeledMessage,
    labelsToAdd: unlabeledLabelsToAdd
  },
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

const addLabels = (number, labelsToAdd) => {
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

const processIssue = (issue, assignee, labelsToAdd, message) =>
  assignIssue(issue.number, assignee)
  .then(() => addLabels(issue.number, labelsToAdd))
  .then(() => {
    if (message) {
      return createComment(issue.number, message, assignee);
    }
  }).then(() => {
    logger.log(`${dryRun ? 'DRYRUN, NO ACTION TAKEN - ' : ''}${issue.number} assigned to ${assignee}${labelsToAdd.length ? ', labeled' : ''}${message ? ', commented' : ''}.`);
  });

const getOldIssues = (cutoffDate, issues=[], page=1) => {
  logger.debug(`Fetching ${issues.length}-${issues.length + fetchIssuesBatch} old issues…`);

  const maxIssuesWanted = numIssuesPerPerson * assignees.length;

  return github.search.issues({
    q: ['is:open is:issue',
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

    if (maxIssuesWanted && issues.length >= maxIssuesWanted) {
      // Got all the issues that we wanted to get
      return _.take(issues, maxIssuesWanted);
    } else if (results.length < fetchIssuesBatch) {
      // Got all the issues
      return issues;
    } else {
      // Need to get more issues
      return getOldIssues(cutoffDate, issues, page + 1);
    }
  });
};

const getOpenIssues = (issues=[], page=1) => {
  logger.debug(`Fetching ${issues.length}-${issues.length + fetchIssuesBatch} open issues…`);

  return github.search.issues({
    q: `is:open is:issue repo:${owner}/${repo}`,
    per_page: fetchIssuesBatch,
    page: page
  }).then(results => {
    results = results.data.items; // unbox search results from probably useful metadata
    issues = issues.concat(results);

    if (results.length < fetchIssuesBatch) {
      return issues;
    } else {
      return getOpenIssues(issues, page + 1);
    }
  });
};

// FLOW STARTS HERE

if (dryRun) {
  logger.log('Dry-run enabled!');
}

const cutoffDate = moment().subtract(numDaysOld, 'd').format('YYYY-MM-DD');
logger.log(`Getting issues that haven't been touched since ${cutoffDate}...`);

const oldIssueLog = [],
      unlabeledIssueLog = [];

getOldIssues(cutoffDate).then(issues => {
  logger.log(`(at least) ${issues.length} un-dealt-with issues in ${owner}/${repo}`);

  const shuffledIssues = _.shuffle(issues);

  const promises = [];

  for (const assignee of assignees) {
    const tissues = shuffledIssues.splice(0, numIssuesPerPerson);
    for (const issue of tissues) {
      logger.debug(`Assigning #${issue.number} to ${assignee}`);
      logger.debug(issue.title);
      logger.debug(issue.html_url);
      logger.debug(`Last updated: ${issue.updated_at}`);
      oldIssueLog.push(issue.number);
      promises.push(processIssue(issue, assignee, ancientLabelsToAdd, ancientMessage));

      logger.debug();
    }
  }

  return Promise.all(promises);
}).then(() => {
  logger.log('\nList of old issues picked:');
  oldIssueLog.forEach(issue => {
    logger.log(`  https://github.com/${owner}/${repo}/issues/${issue}`);
  });

  logger.log('\nGetting open issues to check for incorrect labeling...');
  return getOpenIssues();
}).then(issues => {
  logger.log(`${issues.length} incorrectly labeled issues`);
  const promises = [];

  issues
    .filter(issue => issue.labels.find(({name: issueLabel}) => expectedLabels.find(expectedLabel => !issueLabel.match(expectedLabel))))
    .forEach(issue => {
      unlabeledIssueLog.push(issue.number);
      promises.push(processIssue(issue, _.sample(assignees), unlabeledLabelsToAdd, unlabeledMessage))
    });

  return Promise.all(promises);
}).then(() => {
  logger.log('\nList of unlabeled issues:');
  unlabeledIssueLog.forEach(issue => {
    logger.log(`  https://github.com/${owner}/${repo}/issues/${issue}`);
  });

  logger.log(`\nAll done!`);
}).catch(e => {
  logger.log(e);
});
