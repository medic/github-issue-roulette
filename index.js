/*jshint esversion: 6 */

const _ = require('lodash'),
      GitHubApi = require('github');

const {
  owner,
  repo,
  githubApiToken,
  assignments,
  issuesToPullFrom,
  assignees,
  additionalQueryParams,
  dryRun=true // Safer to force you to turn it on
} = require('./config.json');

const assignmentMessage = (ass) => `@${ass} please decide: to close or to schedule`;
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

const createComment = function(number, assignee) {
  if (dryRun) {
    console.log(`DRYRUN: would comment on ${number} for ${assignee}`);
  } else {
    return github.issues.createComment({
      owner: owner,
      repo: repo,
      number: number,
      body: assignmentMessage(assignee)
    }).then(() => {
      console.log(`Commented on ${number}`);
    });
  }
};

const assignIssue = function(number, assignee) {
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

const getOldestNIssues = function(maxIssuesWanted, issues=[], page=1) {
  console.log(`Fetching ${issues.length}-${issues.length + fetchIssuesBatch} issues…`);

  return github.search.issues({
    q: ['is:open is:issue no:milestone no:assignee',
        `repo:${owner}/${repo}`,
        additionalQueryParams].join(' '),

    sort: 'updated',
    order: 'asc',

    per_page: fetchIssuesBatch,
    page: page
  }).then(results => {
    results = results.items; // unbox search results from probably useful metadata
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

const getAllIssues = function() {
  return getOldestNIssues();
};

// FLOW STARTS HERE

if (dryRun) {
  console.log('Dry-run enabled!');
}

getOldestNIssues(issuesToPullFrom).then(results => {
  console.log(`Found ${results.length} un-dealt-with issues in ${owner}/${repo}`);

  if (assignees.length * assignments > results.length) {
    console.log(`Not enough open issues in ${owner}/${repo} for issue roulette! Congratulations!`);
    return;
  }

  const shuffledIssues = _.shuffle(results);

  const promises = [];

  for (const assignee of assignees) {
    const tissues = shuffledIssues.splice(0, assignments);
    for (const issue of tissues) {
      console.log(`Assigning #${issue.number} to ${assignee}`);
      console.log(issue.title);
      console.log(issue.html_url);
      console.log(`Last updated: ${issue.updated_at}`);
      promises.push(createComment(issue.number, assignee));
      promises.push(assignIssue(issue.number, assignee));
      console.log();
    }
  }

  return Promise.all(promises);
}).catch(e => {
  console.log(e);
});
