const post = async (path, body) => {
  const response = await fetch(`/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  return response.json();
};

export const authClient = {
  signIn: {
    social: async ({ provider, callbackURL }) => {
      const { url, redirect } = await post('/sign-in/social', {
        provider,
        callbackURL,
      });

      if (redirect) window.location.href = url;
    },
  },
  signOut: () => post('/sign-out', {}),
};
