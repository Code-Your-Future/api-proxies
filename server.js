const app = require('express')();
const githubClient = require('./lib/github-client');

app.get('*', (req, res) => {
	if (process.env.PROXY_TO === 'github') {
		return githubClient.fetchUrl(req.originalUrl)
			.then(json => res.json(json))
			.catch(err => {
				if (err.status) {
					res.sendStatus(err.status)
				} else {
					res.sendStatus(503);
				}
			})
	} else {
		res.sendStatus(500);
	}
})

app.listen(process.env.PORT || 3002)

