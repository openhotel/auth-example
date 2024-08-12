import * as bcrypt from "bcrypt";

export const getRandomString = (length: number) =>
  Array.from(
    { length },
    () =>
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".charAt(
        Math.floor(Math.random() * 62),
      ),
  ).join("");

const kv = await Deno.openKv(`./database`);

const expireIn = 1000 * 60 * 60 * 24 * 7;

Deno.serve({ port: 1931 }, async (request: Request) => {
  const { url, method } = request;
  const parsedUrl = new URL(url);

  if (method !== "POST") {
    return new Response("404", { status: 404 });
  }

  const data = await request.json();
  switch (parsedUrl.pathname) {
    //## REGISTER ######################################################################################################
    case "/register": {
      const { value: account } = await kv.get(["accounts", data.email]);

      if (account) {
        return new Response("409 Email already registered", { status: 409 });
      }

      await kv.set(["accounts", data.email], {
        accountId: crypto.randomUUID(),
        passwordHash: bcrypt.hashSync(data.password, bcrypt.genSaltSync(8)),
      });
      return new Response("200", { status: 200 });
    }

    //## LOGIN #########################################################################################################
    case "/login": {
      const { value: account } = await kv.get(["accounts", data.email]);

      if (!account) {
        return new Response("403 Email or password not valid!", {
          status: 403,
        });
      }

      const result = bcrypt.compareSync(
        data.password,
        account.passwordHash,
      );

      if (!result) {
        return new Response("403 Email or password not valid!", {
          status: 403,
        });
      }

      const sessionId = getRandomString(32);
      const token = getRandomString(64);
      const refreshToken = getRandomString(128);

      if (account.sessionId) {
        await kv.delete(["sessions", account.sessionId]);
      }

      await kv.set(["accounts", data.email], {
        ...account,
        sessionId,
        tokenHash: bcrypt.hashSync(token, bcrypt.genSaltSync(8)),
        refreshTokenHash: bcrypt.hashSync(refreshToken, bcrypt.genSaltSync(8)),
      });
      await kv.set(["sessions", sessionId], data.email, {
        expireIn,
      });

      return Response.json({
        status: 200,
        data: {
          sessionId,
          token,
          refreshToken,
        },
      });
    }

    //## VERIFY-SESSION ################################################################################################
    case "/verify-session": {
      const { value: email } = await kv.get(["sessions", data.sessionId]);
      const { value: account } = await kv.get(["accounts", email]);

      //if token is already used
      if (!account.tokenHash) {
        return new Response("403", { status: 403 });
      }

      await kv.set(["accounts", email], {
        ...account,
        tokenHash: undefined,
      });

      const sessionResult = bcrypt.compareSync(
        data.token,
        account.tokenHash,
      );
      if (!sessionResult) {
        return new Response("403", { status: 403 });
      }

      //refresh sessionId expireIn
      await kv.set(["sessions", account.sessionId], data.email, {
        expireIn,
      });

      return Response.json({
        status: 200,
        data: { accountId: account.accountId },
      });
    }

    //## REFRESH-SESSION ###############################################################################################
    case "/refresh-session": {
      const { value: email } = await kv.get(["sessions", data.sessionId]);
      const { value: account } = await kv.get(["accounts", email]);

      const sessionResult = bcrypt.compareSync(
        data.refreshToken,
        account.refreshTokenHash,
      );
      if (!sessionResult) {
        return new Response("403", { status: 403 });
      }

      const token = getRandomString(64);
      const refreshToken = getRandomString(128);

      await kv.set(["accounts", email], {
        ...account,
        tokenHash: bcrypt.hashSync(token, bcrypt.genSaltSync(8)),
        refreshTokenHash: bcrypt.hashSync(refreshToken, bcrypt.genSaltSync(8)),
      });

      return Response.json({
        status: 200,
        data: {
          token,
          refreshToken,
        },
      });
    }
  }

  return new Response("404", { status: 404 });
});
