# Auth example

[![Static Badge](https://img.shields.io/badge/CC_BY--NC--SA_4.0-blue?style=for-the-badge&color=gray)](/LICENSE)
[![Static Badge](https://img.shields.io/badge/discord-b?style=for-the-badge&logo=discord&color=white)](https://discord.gg/qBZfPdNWUj)

___

- `OHAP`: `OpenHotel Auth Protocol`

This projects allows people who want to implement
their own auth methods following the `OHAP` with a 
functional and secure example.


## How to run the project

### Dependencies

- Install `deno >= 1.44`

### Start project

- Run `deno task start`


## How OHAP works
Configure `OpenHotel` config.yml file with:
```yaml
...
auth:
  # Redirects user to this url
  redirect: 'https://auth.openhotel.club/'
  # Server uses this url to check the user sessionId + token
  verify: 'https://auth.openhotel.club/api/v2/verify-session'
...
```

___
#### POST /login
// Client side

##### Request:
```json
{
  "email": "string",
  "password": "string"
}
```
##### Response:

```json
{
  "status": 200,
  "data": {
    "sessionId": "string",
    "token": "string",
    //Optional
    "refreshToken": "string"
  }
}
```
Redirect user to:
> `clientUrl`/#sessionId=`sessionId`&token=`token`
___
#### POST /verify-session
// Server side

##### Request:
```json
{
  "sessionId": "string",
  "token": "string"
}
```
##### Response:

```json
{
  "status": 200,
  "data": {
    "accountId": "string"
  }
}
```

___
### Optional:

#### POST /register
// Client side

##### Request:
```json
{
  "email": "string",
  "password": "string"
}
```
##### Response:

```json
{
  "status": 200
}
```
___

#### POST /refresh-session
// Client side
##### Request:
```json
{
  "sessionId": "string",
  "refreshToken": "string"
}
```

##### Response:
```json
{
  //Same sessionId
  "sessionId": "string",
  //New
  "token": "string",
  //New
  "refreshToken": "string"
}
```
Redirect user to:
> `clientUrl`/#sessionId=`sessionId`&token=`token`