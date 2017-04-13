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
  labelsToAdd,
  message,
  numDaysOld = 0,
  dryRun = true // Safer to force you to turn it on
} = require('./config.json');

const assignmentMessage = (message, assignee) => {
  return message.replace(new RegExp(/@@/, 'g'), '@' + assignee);
};

const fetchIssuesBatch = 100;
var NUM_MILLIS_IN_DAY = 1000 * 60 * 60 * 24;

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
    console.log(`DRYRUN: would comment on ${number} for ${assignee}:`,
      assignmentMessage(message, assignee));
  } else {
    return github.issues.createComment({
      owner: owner,
      repo: repo,
      number: number,
      body: assignmentMessage(message, assignee)
    }).then(() => {
      console.log(`Commented on ${number}`);
    });
  }
};

const assignIssue = (number, assignee) => {
  if (dryRun) {
    console.log(`DRYRUN: would assign ${number} to ${assignee}`);
  } else {
    return github.issues.addAssigneesToIssue({
      owner: owner,
      repo: repo,
      number: number,
      assignees: [assignee]
    }).then(() => {
      console.log(`Assigned ${number} to ${assignee}`);
    });
  }
};

const addLabels = (number) => {
  if (dryRun) {
    console.log(`DRYRUN: would have added ${labelsToAdd} to ${number}`);
  } else {
    return github.issues.addLabels({
      owner: owner,
      repo: repo,
      number: number,
      body: labelsToAdd
    }).then(() => {
      console.log(`Added ${labelsToAdd} to ${number}`);
    });
  }
};

const getOldestNIssues = (maxIssuesWanted, issues=[], page=1) => {
  console.log(`Fetching ${issues.length}-${issues.length + fetchIssuesBatch} issues…`);

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
  console.log('Dry-run enabled!');
}

var cutoffDateMillis = new Date().getTime() - numDaysOld * NUM_MILLIS_IN_DAY;
var cutoffDate = moment(new Date(cutoffDateMillis)).format('YYYY-MM-DD');
console.log(`Getting issues that haven\'t been touched since ${cutoffDate}`);

getOldestNIssues(numIssuesToPickFrom).then(results => {
  console.log(`Found ${results.length} un-dealt-with issues in ${owner}/${repo}`);

  if (assignees.length * numIssuesPerPerson > results.length) {
    console.log(`Not enough open issues in ${owner}/${repo} for issue roulette! Congratulations!`);
    return;
  }

  const shuffledIssues = _.shuffle(results);

  const promises = [];

  for (const assignee of assignees) {
    const tissues = shuffledIssues.splice(0, numIssuesPerPerson);
    for (const issue of tissues) {
      console.log(`Assigning #${issue.number} to ${assignee}`);
      console.log(issue.title);
      console.log(issue.html_url);
      console.log(`Last updated: ${issue.updated_at}`);
      promises.push(
        assignIssue(issue.number, assignee),
        addLabels(issue.number, labelsToAdd));
      if (message) {
        promises.push(createComment(issue.number, message, assignee));
      }

      console.log();
    }
  }

  return Promise.all(promises);
}).catch(e => {
  console.log(e);
});
