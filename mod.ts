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

const LOGIN_TOKEN_DURATION = 1000 * 60 * 5;
const REFRESH_TOKEN_DURATION = 1000 * 60 * 60 * 24 * 7;
const TICKET_DURATION = 1000 * 60 * 60 * 2;

Deno.serve({ port: 1931 }, async (request: Request) => {
  const { url, method } = request;
  const parsedUrl = new URL(url);

  if (method !== "POST") {
    return new Response("404", { status: 404 });
  }

  const data = await request.json();
  switch (parsedUrl.pathname) {
    //## CREATE-TICKET ######################################################################################################
    case "/create-ticket": {
      
      const ticketId = crypto.randomUUID()
      await kv.set(["tickets", ticketId], {
        ticketId,
        ticketKeyHash: bcrypt.hashSync(data.ticketKey, bcrypt.genSaltSync(8)),
        redirectUrl: data.redirectUrl,
        isUsed: false
      }, {
        expireIn: TICKET_DURATION
      });
      
      return Response.json({
        status: 200,
        data: {
          ticketId
        }
      });
    }
    //## REGISTER ######################################################################################################
    case "/register": {
      const { value: account } = await kv.get(["accounts", data.email]);
      if (account) {
        return new Response("409 Email already registered", { status: 409 });
      }

      const { value: accountByUsername } = await kv.get([
        "accountsByUsername",
        data.username,
      ]);
      if (accountByUsername) {
        return new Response("409 Username already in use", { status: 409 });
      }

      await kv.set(["accounts", data.email], {
        accountId: crypto.randomUUID(),
        passwordHash: bcrypt.hashSync(data.password, bcrypt.genSaltSync(8)),
        username: data.username,
      });
      await kv.set(["accountsByUsername", data.username], data.email);
      return new Response("200", { status: 200 });
    }

    //## LOGIN #########################################################################################################
    case "/login": {
      const { value: ticket } = await kv.get(["tickets", data.ticketId]);
      
      if (!ticket || ticket.isUsed) {
        return new Response("403 Ticket is not valid!", {
          status: 403,
        });
      }
      
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

      const sessionId = crypto.randomUUID();
      const token = getRandomString(64);
      const refreshToken = getRandomString(128);

      if (account.sessionId) {
        await kv.delete(["accountsByRefreshSession", account.sessionId]);
        await kv.delete(["accountsBySession", account.sessionId]);
      }

      await kv.set(["accounts", data.email], {
        ...account,
        sessionId,
        tokenHash: bcrypt.hashSync(token, bcrypt.genSaltSync(8)),
        refreshTokenHash: bcrypt.hashSync(refreshToken, bcrypt.genSaltSync(8)),
      });
      await kv.set(["accountsBySession", sessionId], data.email, {
        expireIn: LOGIN_TOKEN_DURATION,
      });
      await kv.set(["accountsByRefreshSession", sessionId], data.email, {
        expireIn: REFRESH_TOKEN_DURATION,
      });
      await kv.set(["tickets", ticket.ticketId], {
        ...ticket,
        isUsed: true
      }, {
        expireIn: LOGIN_TOKEN_DURATION
      });

      return Response.json({
        status: 200,
        data: {
          redirectUrl: `${ticket.redirectUrl}?ticketId=${ticket.ticketId}&sessionId=${sessionId}&token=${token}`,
          
          sessionId,
          token,
          refreshToken,
        },
      });
    }

    //## CLAIM-SESSION #################################################################################################
    case "/claim-session": {
      const { value: ticket } = await kv.get(["tickets", data.ticketId]);
      
      if (!ticket || !ticket.isUsed) {
        return new Response("403", {
          status: 403,
        });
      }
      
      const ticketResult = bcrypt.compareSync(
        data.ticketKey,
        ticket.ticketKeyHash,
      );
      if (!ticketResult) {
        return new Response("403", { status: 403 });
      }
      
      const { value: email } = await kv.get([
        "accountsBySession",
        data.sessionId,
      ]);
      if (!email) {
        return new Response("403", { status: 403 });
      }
      const { value: account } = await kv.get(["accounts", email]);

      //if token is already used
      if (!account.tokenHash) {
        return new Response("403", { status: 403 });
      }
      
      //destroy session token (but not refresh token)
      await kv.delete(["accountsBySession", account.sessionId]);
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

      //destroy ticket
      await kv.delete(["tickets", data.ticketId]);

      return Response.json({
        status: 200,
        data: { accountId: account.accountId, username: account.username },
      });
    }

    //## REFRESH-SESSION ###############################################################################################
    case "/refresh-session": {
      const { value: ticket } = await kv.get(["tickets", data.ticketId]);
      
      if (!ticket || ticket.isUsed) {
        return new Response("403 Ticket is not valid!", {
          status: 403,
        });
      }
      
      const { value: email } = await kv.get([
        "accountsByRefreshSession",
        data.sessionId,
      ]);
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
      
      await kv.set(["accountsBySession", data.sessionId], email, {
        expireIn: LOGIN_TOKEN_DURATION,
      });
      await kv.set(["accountsByRefreshSession", data.sessionId], email, {
        expireIn: REFRESH_TOKEN_DURATION,
      });
      await kv.set(["tickets", ticket.ticketId], {
        ...ticket,
        isUsed: true
      }, {
        expireIn: LOGIN_TOKEN_DURATION
      });
      
      return Response.json({
        status: 200,
        data: {
          redirectUrl: `${ticket.redirectUrl}?ticketId=${ticket.ticketId}&sessionId=${account.sessionId}&token=${token}`,
          
          token,
          refreshToken,
        },
      });
    }
  }

  return new Response("404", { status: 404 });
});
