const fetch = require('node-fetch');
const fetchLink = require('fetch-link');
const cache = require('./cache');
const crypto = require('crypto');
const hash = str => crypto.createHash('md5').update(str).digest('hex');

let auths = ['GITHUB_API_TOKEN', 'GITHUB_API_TOKEN_2']
	.filter(name => !!process.env[name])
	.map(name => `Basic ${new Buffer(process.env[name]).toString('base64')}`)

const getAuth = () => {
	if (auths.length) {
		return auths[0];
	} else {
		throw `No github authorization defined.

If working locally set the envoronment variable GITHUB_API_TOKEN to
a value retrieved here https://github.com/settings/tokens`;
	}
}

const mothballAuth = (blocked) => {
	process.env.DEBUG && console.warn('GITHUB AUTH has hit its rate limit. trying another one')//eslint-disable-line
	auths = auths.filter(auth => auth !== blocked);
	if (!auths.length) {
		throw new Error('All github auths have hit their rate limits!!!');
	}

}

const githubAwareFetch = (url, options) => {
	return fetch(url, options)
		// handle rate-limiting
		.then(res => {
			if (!res.ok) {
				if (Number(res.headers.get('X-RateLimit-Remaining')) === 0) {
					mothballAuth(options.headers.Authorization);
					const newHeaders = Object.assign({}, options.headers, {Authorization: getAuth()});
					return githubAwareFetch(url, {headers: newHeaders})
				}
			}
			return res;
		})
		// Handle the fact that github api doesn't add link headers to 304s :(
		.then(res => {
			if (res.status === 304) {
				return linkHeaderCache.get(hash(url))
					.then(link => {
						if (link) {
							process.env.DEBUG && console.log(`set link header for ${url}`)//eslint-disable-line
							res.headers.set('link', link)
						}
						return res;
					})

			} else {
				return linkHeaderCache.set(hash(url), res.headers.get('link'))
					.then(() => res)
			}
		})

}

fetchLink.setFetchImplementation(githubAwareFetch);

const etagCache = cache('etags');
const linkHeaderCache = cache('link-headers')
const responseCache = cache('responses');

const toJson = (res) => {
	process.env.DEBUG && console.log(`${res.headers.get('X-RateLimit-Remaining')} remaining until ${new Date(res.headers.get('X-RateLimit-Reset') * 1000).toISOString()}`)//eslint-disable-line
	if (res.ok) {
		process.env.DEBUG && console.log(`${res.url} response ok`);//eslint-disable-line

		return etagCache.set(res.url, res.headers.get('etag'))
			.then(() =>
				res.json()
					.then(val =>
						responseCache.set(res.url, JSON.stringify(val))
							.then(() => val)
					)
			)
	} else if (res.status === 304) {
		process.env.DEBUG && console.log(`hit cache for ${res.url}`) //eslint-disable-line
		return responseCache.get(res.url)
			.then(JSON.parse);
	} else {
		throw {status: res.status}
	}
}

module.exports.fetchUrl = url => etagCache.get(`https://api.github.com${url}`)
	.then(etag =>
		githubAwareFetch(`https://api.github.com${url}`, {
			headers: {
				Authorization: getAuth(),
				'If-None-Match': etag
			}
		})
	)
	.then(toJson)

module.exports.fetchList = url => fetchLink.all(`https://api.github.com${url}`, {
	direction: 'next',
	fetch: fetchUrl => etagCache.get(fetchUrl)
		.then(etag =>
			({
				headers: {
					Authorization: getAuth(),
					'If-None-Match': etag
				}
			})
		)
})
	.then(responses => Promise.all(responses.map(toJson)))
	.then(arr => [].concat.apply([], arr))

module.exports.fetchFile = (repo, file) => fetch(`https://raw.githubusercontent.com/financial-times/${repo}/master/${file}`, {
	headers: {
		Authorization: getAuth()
	}
})
	.then(res => {

		if (res.ok) {
			return res.text()
		}
		throw `${repo} ${file} response not ok`;
	})