# read-bbs-bundle

read-bbs-bundle is a [NodeCG](http://github.com/nodecg/nodecg) bundle.
It works with NodeCG versions which satisfy this [semver](https://docs.npmjs.com/getting-started/semantic-versioning) range: `^2.0.0`
You will need to have an appropriate version of NodeCG installed to use it.


## Developing

Use the following commands:

-   `npm run build`: Build the project once.
-   `npm run watch`: Build the project and automatically rebuild on changes.
-   `npm run dev`: Build the project, automatically rebuild on changes, launch the NodeCG server, and automatically restart the NodeCG server on changes.
    -   Only restarts the NodeCG server when server-side (i.e. extension) code changes. Changes to client-side code (i.e. dashboard panels and graphics) will not cause the server to restart, nor will they cause browser tabs to automatically refresh.

## Configuration

Create `cfg/read-bbs-bundle.json` from `cfg/read-bbs-bundle.json.example`.

-   `bbsMqtt`: BBS.JPNKN MQTT bridge settings.
-   `twitchChat`: Twitch EventSub chat bridge settings.
-   `twitchAuthState` (Replicant): Runtime Twitch auth state with refreshed tokens.

## Twitch Token Setup

This bundle expects an initial Twitch token set to be provided from outside the bundle (in `cfg/read-bbs-bundle.json`).
You may need [registered app](https://dev.twitch.tv/docs/authentication/register-app).

For testing, you can use the Twitch CLI:

1. Install Twitch CLI.
2. Login with your app ID and secret.
    -   `twitch configure`
3. Get a user token with chat read scope:
    -   `twitch token --user-token --scopes "user:read:chat"`
4. Set the returned values in `twitchChat.initialToken`.
    -   `accessToken`: Returned user access token
    -   `refreshToken`: Returned refresh token
    -   `scope`: Scope list used for the token
    -   `expiresIn`: Token lifetime in seconds (use `null` if unavailable)
    -   `obtainmentTimestamp`: Unix timestamp in milliseconds when token was issued

You also need:

-   `twitchChat.clientId`
-   `twitchChat.clientSecret`
-   `twitchChat.broadcasterUserId`
-   `twitchChat.readAsUserId`

At runtime, refreshed tokens are persisted to Replicant `twitchAuthState`.
On next startup, the bundle uses `twitchAuthState.token` first, then falls back to `twitchChat.initialToken`.
You should treat `cfg/read-bbs-bundle.json` as initial seed data only.

To disable Twitch integration, set `twitchChat.enabled` to `false`.
