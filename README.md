# Sushiscan dl

## First setup

run the commands

```shell
npm i
npx playwright install firefox
npm run build
```

cookies are stored in the `cookies.json` file.

If you cannot complete the captcha:

- go to the desired page in your browser
- press F12, go to 'storage > cookies'
- manually fill the `cookies.json` file with your data

## Execution

```shell
npm run start -- <url>
```
