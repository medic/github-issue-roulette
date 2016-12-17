/*jshint esversion: 6 */

const _ = require('lodash'),
      GitHubApi = require('github');

const {
  owner,
  repo,
  githubApiToken,
  assignments,
  assignees,
  dryRun=false
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

const getAllIssues = function(issues=[], page=0) {
  console.log(`Fetching ${fetchIssuesBatch*page}-${(fetchIssuesBatch*page)+fetchIssuesBatch} issues…`);
  return github.issues.getForRepo({
    owner: owner,
    repo: repo,

    milestone: 'none',
    assignee: 'none',

    per_page: fetchIssuesBatch,
    page: page
  }).then(results => {
    issues = results.concat(issues);

    if (results.length < fetchIssuesBatch) {
      return issues;
    } else {
      return getAllIssues(issues, page + 1);
    }
  });
};

// FLOW STARTS HERE

if (dryRun) {
  console.log('Dry-run enabled!');
}

getAllIssues().then(results => {
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
      promises.push(createComment(issue.number, assignee));
      promises.push(assignIssue(issue.number, assignee));
    }
  }

  return Promise.all(promises);
}).catch(e => {
  console.log(e);
});
