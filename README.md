# api proxies

To give the illusion of multiple api services, deploy multiple instances to different heroku hosts. Define which service to proxy to using an env var `PROXY_TO`

Currently supported services: `github`

