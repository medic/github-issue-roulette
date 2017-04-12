/**
 * Removes all the assigness specified in the config, and all the labels specified in the
 * config, from a list of issues.
 */

var issuesToFix = [
/* paste your array of issue numbers here */
];

var _ = require('lodash'),
      GitHubApi = require('github');

var {
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


var github = new GitHubApi({
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
var deassignIssue = function(number, assignee) {
  if (dryRun) {
    console.log('DRYRUN: would deAssign ', number, 'from', assignee);
  } else {
    var options = {
      owner: owner,
      repo: repo,
      number: number,
      assignees: [assignee],
      body: {} // you get error if no body.
    };
    console.log('options', options);
    return github.issues.removeAssigneesFromIssue(options).then(function(result) {
      console.log('Deassigned ', number, 'from', assignee);
    }).catch(function(err) {
      console.log('err deassigning', err);
    });
  }
};

// If the label isn't present, it still returns success.
var delabelIssue = function(number, labelName) {
  if (dryRun) {
    console.log('DRYRUN: would have removed', labelName, 'from', number);
  } else {
    return github.issues.removeLabel({
      owner: owner,
      repo: repo,
      number: number,
      name: labelName,
      body: {} // you get error if no body.
    }).then(function() {
      console.log('Removed', labelName, 'from', number);
    }).catch(function(err) {
      console.log('err delabeling', err);
    });
  }
};

issuesToFix.forEach(function(issue) {
  assignees.forEach(function(assignee) {
    deassignIssue(issue, assignee);
  });

  labelsToAdd.forEach(function(label) {
    delabelIssue(issue, label);
  });
});
