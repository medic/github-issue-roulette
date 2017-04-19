/*jshint esversion: 6 */
/**
 * Removes all the assigness specified in the config, and all the labels specified in the
 * config, from a list of issues.
 */

const issuesToFix = [
/* paste your array of issue numbers here */
];

const _ = require('lodash'),
      GitHubApi = require('github');

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
  dryRun=true // Safer to force you to turn it on
} = require('./config.json');


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

// If the assignee isn't present, it still returns success.
const deassignIssue = (number, assignee) => {
  if (dryRun) {
    console.log('DRYRUN: would deAssign ', number, 'from', assignee);
  } else {
    const options = {
      owner: owner,
      repo: repo,
      number: number,
      assignees: [assignee],
      body: {} // you get error if no body.
    };
    console.log('options', options);
    return github.issues.removeAssigneesFromIssue(options)
    .then(() => console.log('Deassigned ', number, 'from', assignee))
    .catch((err) => console.log('err deassigning', err));
  }
};

// If the label isn't present, it still returns success.
const delabelIssue = (number, labelName) => {
  if (dryRun) {
    console.log('DRYRUN: would have removed', labelName, 'from', number);
  } else {
    return github.issues.removeLabel({
      owner: owner,
      repo: repo,
      number: number,
      name: labelName,
      body: {} // you get an error if no body.
    })
    .then(() => console.log('Removed', labelName, 'from', number))
    .catch((err) => console.log('err delabeling', err));
  }
};

issuesToFix.forEach((issue) => {
  assignees.forEach((assignee) =>
    deassignIssue(issue, assignee)
  );

  labelsToAdd.forEach((label) =>
    delabelIssue(issue, label)
  );
});
