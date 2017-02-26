const app = require('express')();
const githubClient = require('./lib/github-client');

app.get('*', (req, res) => {
	if (process.env.PROXY_TO === 'github') {
		return githubClient.fetchUrl(req.originalUrl)
			.then((json, link) => {
				Object.keys(json).forEach(k => {
					if (/_url$/.test(k)) {
						json[k] = json[k].replace('https://api.github.com', 'http://cyf-github-api.herokuapp.com')
					}
				})
				if (link) {
					res.set('link', link)
				}
				res.json(json)
			})
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

