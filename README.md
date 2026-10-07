[![CI Test Status][ci-img]][ci-url]
[![Code Climate][clim-img]][clim-url]
[![NPM][npm-img]][npm-url]

# haraka-plugin-abusix-feed

This plugin will send required mail transaction data to an Abusix data channel to help improve accuracy of Abusix Mail Intelligence.

More information can be found [here](https://abusix.helpkit.so/data-channels/5q9CV1FJbGR3vWZqVAYrqa/provide-mta-transaction-data-to-abusix/3fB8GA5rvc6zfuwberK43n) and [here](https://abusix.helpkit.so/data-channels/5q9CV1FJbGR3vWZqVAYrqa/submitting-mta-transaction-feeds-via-udp-to-data-channels/2xce2GDc52am5Ms168Y1Dv)

## Requirements

In order to successfully use this plugin, you will need:

- A working Haraka instance (obviously)
- An Abusix data channel feed-id and it's corresponding key

## Installation

```sh
cd /path/to/local/haraka
npm install haraka-plugin-abusix-feed
echo "abusix-feed" >> config/plugins
service haraka restart
```

## Configuration

Copy the sample config file from the distribution into your haraka config dir and then modify them:

```sh
cp node_modules/haraka-plugin-abusix-feed/config/abusix-feed.ini config/
```

Set your feed name and key as provided by the Abusix data channel creation wizard

```ini
[feed]
name=txnXXX
key=SetYouRFeeDKeeYHeRe
dest=smtp-rttf.abusix.com:12211
```

# Author and credits

Written by Sébastien Riccio. Some code stolen from the [Abusix Postfix Policy Daemon](https://gitlab.com/abusix-public/abusix_ppd)

<!-- leave these buried at the bottom of the document -->

[ci-img]: https://github.com/sriccio/haraka-plugin-abusix-feed/actions/workflows/ci.yml/badge.svg
[ci-url]: https://github.com/sriccio/haraka-plugin-abusix-feed/actions/workflows/ci.yml
[clim-img]: https://codeclimate.com/github/sriccio/haraka-plugin-abusix-feed/badges/gpa.svg
[clim-url]: https://codeclimate.com/github/sriccio/haraka-plugin-abusix-feed
[npm-img]: https://nodei.co/npm/haraka-plugin-abusix-feed.png
[npm-url]: https://www.npmjs.com/package/haraka-plugin-abusix-feed
