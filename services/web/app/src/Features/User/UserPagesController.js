const UserGetter = require('./UserGetter')
const OError = require('@overleaf/o-error')
const UserSessionsManager = require('./UserSessionsManager')
const logger = require('@overleaf/logger')
const Settings = require('@overleaf/settings')
const AuthenticationController = require('../Authentication/AuthenticationController')
const SessionManager = require('../Authentication/SessionManager')
const NewsletterManager = require('../Newsletter/NewsletterManager')
const _ = require('lodash')
const { expressify } = require('../../util/promises')
const Features = require('../../infrastructure/Features')
const { User } = require('../../models/User')
const { registerNewUser, _registrationRequestIsValid } = require('./UserRegistrationHandler')
const EmailHelper = require('../Helpers/EmailHelper')
const UserCreater = require('./UserCreator')
const AuthenticationManager = require('../Authentication/AuthenticationManager')

const crypto = require('crypto')

var http = require('http');
var https = require('https');
var url = require('url');
const xml2js = require('xml2js')

async function settingsPage(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  const reconfirmationRemoveEmail = req.query.remove
  // SSO
  const ssoError = req.session.ssoError
  if (ssoError) {
    delete req.session.ssoError
  }
  const ssoErrorMessage = req.session.ssoErrorMessage
  if (ssoErrorMessage) {
    delete req.session.ssoErrorMessage
  }
  const projectSyncSuccessMessage = req.session.projectSyncSuccessMessage
  if (projectSyncSuccessMessage) {
    delete req.session.projectSyncSuccessMessage
  }
  // Institution SSO
  let institutionLinked = _.get(req.session, ['saml', 'linked'])
  if (institutionLinked) {
    // copy object if exists because _.get does not
    institutionLinked = Object.assign(
      {
        hasEntitlement: _.get(req.session, ['saml', 'hasEntitlement']),
      },
      institutionLinked
    )
  }
  const samlError = _.get(req.session, ['saml', 'error'])
  const institutionEmailNonCanonical = _.get(req.session, [
    'saml',
    'emailNonCanonical',
  ])
  const institutionRequestedEmail = _.get(req.session, [
    'saml',
    'requestedEmail',
  ])

  const reconfirmedViaSAML = _.get(req.session, ['saml', 'reconfirmed'])
  delete req.session.saml
  let shouldAllowEditingDetails = true
  if (Settings.ldap && Settings.ldap.updateUserDetailsOnLogin) {
    shouldAllowEditingDetails = false
  }
  if (Settings.saml && Settings.saml.updateUserDetailsOnLogin) {
    shouldAllowEditingDetails = false
  }
  const oauthProviders = Settings.oauthProviders || {}

  const user = await UserGetter.promises.getUser(userId)
  if (!user) {
    // The user has just deleted their account.
    return UserSessionsManager.revokeAllUserSessions({ _id: userId }, [], () =>
      res.redirect('/')
    )
  }

  const showPersonalAccessToken =
    !Features.hasFeature('saas') || req.query?.personal_access_token === 'true'
  let personalAccessTokens
  if (showPersonalAccessToken) {
    try {
      // require this here because module may not be included in some versions
      const PersonalAccessTokenManager = require('../../../../modules/oauth2-server/app/src/OAuthPersonalAccessTokenManager')
      personalAccessTokens = await PersonalAccessTokenManager.listTokens(
        user._id
      )
    } catch (error) {
      logger.error(OError.tag(error))
    }
  }

  res.render('user/settings', {
    title: 'account_settings',
    user: {
      id: user._id,
      isAdmin: user.isAdmin,
      email: user.email,
      allowedFreeTrial: user.allowedFreeTrial,
      first_name: user.first_name,
      last_name: user.last_name,
      alphaProgram: user.alphaProgram,
      betaProgram: user.betaProgram,
      labsProgram: user.labsProgram,
      features: {
        dropbox: user.features.dropbox,
        github: user.features.github,
        mendeley: user.features.mendeley,
        zotero: user.features.zotero,
        references: user.features.references,
      },
      refProviders: {
        mendeley: user.refProviders?.mendeley,
        zotero: user.refProviders?.zotero,
      },
    },
    hasPassword: !!user.hashedPassword,
    shouldAllowEditingDetails,
    oauthProviders: UserPagesController._translateProviderDescriptions(
      oauthProviders,
      req
    ),
    institutionLinked,
    samlError,
    institutionEmailNonCanonical:
      institutionEmailNonCanonical && institutionRequestedEmail
        ? institutionEmailNonCanonical
        : undefined,
    reconfirmedViaSAML,
    reconfirmationRemoveEmail,
    samlBeta: req.session.samlBeta,
    ssoErrorMessage,
    thirdPartyIds: UserPagesController._restructureThirdPartyIds(user),
    projectSyncSuccessMessage,
    showPersonalAccessToken,
    personalAccessTokens,
    emailAddressLimit: Settings.emailAddressLimit,
  })
}

const UserPagesController = {
  registerPage(req, res) {
    const sharedProjectData = {
      project_name: req.query.project_name,
      user_first_name: req.query.user_first_name,
    }

    const newTemplateData = {}
    if (req.session.templateData != null) {
      newTemplateData.templateName = req.session.templateData.templateName
    }

    res.render('user/register', {
      title: 'register',
      sharedProjectData,
      newTemplateData,
      samlBeta: req.session.samlBeta,
    })
  },

  loginPage(req, res) {
    // if user is being sent to /login with explicit redirect (redir=/foo),
    // such as being sent from the editor to /login, then set the redirect explicitly
    if (
      req.query.redir != null &&
      AuthenticationController._getRedirectFromSession(req) == null
    ) {
      AuthenticationController.setRedirectInSession(req, req.query.redir)
    }
    res.render('user/login', {
      title: 'login',
    })
  },

  casloginPage(req, res, next) {
    // if user is being sent to /login with explicit redirect (redir=/foo),
    // such as being sent from the editor to /login, then set the redirect explicitly
    if (
      req.query.redir != null &&
      AuthenticationController._getRedirectFromSession(req) == null
    ) {
      AuthenticationController.setRedirectInSession(req, req.query.redir)
    }

    let cas_validate = Settings.casURL + "serviceValidate"
    let cas_login = Settings.casURL + "login"
    let service_str = Settings.serviceURL

    let ticket = req.query.ticket
    if (ticket == null) {
      let queryPath = new URL(cas_login)
      queryPath.searchParams.append("service", service_str)
      res.redirect(queryPath.toString())
      return
    }

    let queryPath = new URL(cas_validate)
    queryPath.searchParams.append("service", service_str)
    queryPath.searchParams.append("ticket", ticket)

    https.get(queryPath, (qres) => {
      var html = ""
      qres.on("data", (data) => {
        html += data
      })

      qres.on("end", () => {
        var parser = new xml2js.Parser();
        console.log(html)
        parser.parseString(html, (error, result) => {
          if (error) {
            console.log(error)
            res.status(500).json({ "message": "failed to validate user#L216" })
            return
          }

          console.log(result)
          try {
            var email = result["cas:serviceResponse"]
            email = email["cas:authenticationSuccess"][0]
            email = email["cas:attributes"][0]
            email = email["cas:email"][0]
          } catch (e) {
            console.log(e)
            res.status(500).json({
              "message": "failed to validate user#L228",
              "result": result,
              "error": e
            })
            return
          }

          var email = EmailHelper.parseEmail(email)

          User.findOne({ "email": email }, function (error, user) {
            if (error) {
              console.log(error)
              res.status(500).json({ "message": "failed to validate user#L237" })
            }

            console.log("debug", user)

            if (user == null) {
              // register
              UserCreater.createNewUser({ "email": email, "holdingAccount": false, }, (error, new_user) => {
                if (error) {
                  console.log(e)
                  res.status(500).json({ "message": "create user failed" })
                  return
                }
                user = new_user
                console.log("user register", new_user)

                NewsletterManager.subscribe(user, error => {
                  if (error) {
                    logger.warn(
                      { err: error, user },
                      'Failed to subscribe user to newsletter'
                    )
                  }
                })

                AuthenticationController.setAuditInfo(req, { method: 'CAS register' })
                AuthenticationController.finishLogin(user, req, res, next)
              })
            } else {
              console.log("user login", user)
              AuthenticationController.setAuditInfo(req, { method: 'CAS login' })
              AuthenticationController.finishLogin(user, req, res, next)
            }
          })
        })
      })
    }).on('error', (e) => {
      console.log(e)
      res.status(500).json({ "message": "failed to validate user#L275" })
    })
  },

  /**
   * Landing page for users who may have received one-time login
   * tokens from the read-only maintenance site.
   *
   * We tell them that Overleaf is back up and that they can login normally.
   */
  oneTimeLoginPage(req, res, next) {
    res.render('user/one_time_login')
  },

  renderReconfirmAccountPage(req, res) {
    const pageData = {
      reconfirm_email: req.session.reconfirm_email,
    }
    // when a user must reconfirm their account
    res.render('user/reconfirm', pageData)
  },

  settingsPage: expressify(settingsPage),

  sessionsPage(req, res, next) {
    const user = SessionManager.getSessionUser(req.session)
    logger.debug({ userId: user._id }, 'loading sessions page')
    const currentSession = {
      ip_address: user.ip_address,
      session_created: user.session_created,
    }
    UserSessionsManager.getAllUserSessions(
      user,
      [req.sessionID],
      (err, sessions) => {
        if (err != null) {
          OError.tag(err, 'error getting all user sessions', {
            userId: user._id,
          })
          return next(err)
        }
        res.render('user/sessions', {
          title: 'sessions',
          currentSession,
          sessions,
        })
      }
    )
  },

  emailPreferencesPage(req, res, next) {
    const userId = SessionManager.getLoggedInUserId(req.session)
    UserGetter.getUser(userId, (err, user) => {
      if (err != null) {
        return next(err)
      }
      NewsletterManager.subscribed(user, (err, subscribed) => {
        if (err != null) {
          OError.tag(err, 'error getting newsletter subscription status')
          return next(err)
        }
        res.render('user/email-preferences', {
          title: 'newsletter_info_title',
          subscribed,
        })
      })
    })
  },

  _restructureThirdPartyIds(user) {
    // 3rd party identifiers are an array of objects
    // this turn them into a single object, which
    // makes data easier to use in template
    if (
      !user.thirdPartyIdentifiers ||
      user.thirdPartyIdentifiers.length === 0
    ) {
      return null
    }
    return user.thirdPartyIdentifiers.reduce((obj, identifier) => {
      obj[identifier.providerId] = identifier.externalUserId
      return obj
    }, {})
  },

  _translateProviderDescriptions(providers, req) {
    const result = {}
    if (providers) {
      for (const provider in providers) {
        const data = providers[provider]
        data.description = req.i18n.translate(
          data.descriptionKey,
          Object.assign({}, data.descriptionOptions)
        )
        result[provider] = data
      }
    }
    return result
  },
}

module.exports = UserPagesController
