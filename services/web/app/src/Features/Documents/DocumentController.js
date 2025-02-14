const ProjectGetter = require('../Project/ProjectGetter')
const OError = require('@overleaf/o-error')
const ProjectLocator = require('../Project/ProjectLocator')
const ProjectEntityHandler = require('../Project/ProjectEntityHandler')
const ProjectEntityUpdateHandler = require('../Project/ProjectEntityUpdateHandler')
const logger = require('@overleaf/logger')
const _ = require('lodash')
const { plainTextResponse } = require('../../infrastructure/Response')
const DocstoreManager = require('../Docstore/DocstoreManager')

function getDocument(req, res, next) {
  const { Project_id: projectId, doc_id: docId } = req.params
  const plain = req.query.plain === 'true'
  const peek = req.query.peek === 'true'
  ProjectGetter.getProject(
    projectId,
    { rootFolder: true, overleaf: true },
    (error, project) => {
      if (error) {
        return next(error)
      }
      if (!project) {
        return res.sendStatus(404)
      }
      ProjectLocator.findElement(
        { project, element_id: docId, type: 'doc' },
        (error, doc, path) => {
          if (error) {
            OError.tag(error, 'error finding element for getDocument', {
              docId,
              projectId,
            })
            return next(error)
          }
          ProjectEntityHandler.getDoc(
            projectId,
            docId,
            { peek },
            (error, lines, rev, version, ranges) => {
              if (error) {
                OError.tag(
                  error,
                  'error finding doc contents for getDocument',
                  {
                    docId,
                    projectId,
                  }
                )
                return next(error)
              }
              if (plain) {
                plainTextResponse(res, lines.join('\n'))
              } else {
                const projectHistoryId = _.get(project, 'overleaf.history.id')

                // all projects are now migrated to Full Project History, keeping the field
                // for API compatibility
                const projectHistoryType = 'project-history'

                res.json({
                  lines,
                  version,
                  ranges,
                  pathname: path.fileSystem,
                  projectHistoryId,
                  projectHistoryType,
                })
              }
            }
          )
        }
      )
    }
  )
}

function setDocument(req, res, next) {
  const { Project_id: projectId, doc_id: docId } = req.params
  const { lines, version, ranges, lastUpdatedAt, lastUpdatedBy } = req.body
  ProjectEntityUpdateHandler.updateDocLines(
    projectId,
    docId,
    lines,
    version,
    ranges,
    lastUpdatedAt,
    lastUpdatedBy,
    (error, result) => {
      if (error) {
        OError.tag(error, 'error finding element for getDocument', {
          docId,
          projectId,
        })
        return next(error)
      }
      logger.debug(
        { docId, projectId },
        'finished receiving set document request from api (docupdater)'
      )
      res.json(result)
    }
  )
}

function getAllRanges (req, res, next) {
  const { project_id } = req.params
  DocstoreManager.getAllRanges(project_id, (error, result) => {
    logger.debug(error, result)
    if (error) {
      return next(error)
    }
    res.json(result)
  })
}

module.exports = { getDocument, setDocument, getAllRanges }
