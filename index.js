const _ = require('lodash'),
      GitHubApi = require('github');

const {
  owner,
  repo,
  githubApiToken,
  assignments,
  assignees
} = require('./config.json');

const assignmentMessage = (ass) => `@${ass} please decide: to close or to schedule`;

const github = new GitHubApi({
  protocol: 'https',
  host: 'api.github.com',
  headers: {
    'user-agent': 'github-issue-roulette',
  }
});

github.authenticate({
    type: 'token',
    token: GithubApiToken
});

github.issues.getForRepo({
  owner: owner,
  repo: repo,

  per_page: 3,

  milesone: 'none',
  user: 'none'
}).then(results => {
  const issues = _.shuffle(results);

  const promises = [];

  for (assignee of assignees) {
    const tissues = issues.splice(0, assignments);
    for (issue of tissues) {
      promises.put(github.issues.createComment({
        owner: owner,
        repo: repo,
        number: issue.number,
        body: assignmentMessage(assignee)
      }));
      promises.put(github.issues.addAssigneeToIssue({
        owner: owner,
        repo: repo,
        number: issue.number,
        assigneess: [assignee]
      }));
    }
  }

  return Promise.all(promises);
}).then((promiseResults) => {
  console.log(promiseResults);
}).catch(e => {
  console.log(e);
});
