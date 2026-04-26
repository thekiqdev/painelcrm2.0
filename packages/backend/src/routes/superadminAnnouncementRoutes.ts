import { Router } from 'express';
import * as groups from '../controllers/superadminAnnouncementGroupsController.js';
import * as ann from '../controllers/superadminAnnouncementsController.js';

const router = Router();

router.get('/groups', groups.listAnnouncementGroups);
router.post('/groups', groups.createAnnouncementGroup);
router.patch('/groups/:id', groups.patchAnnouncementGroup);
router.get('/groups/:id/members', groups.getAnnouncementGroupMembers);
router.put('/groups/:id/members', groups.putAnnouncementGroupMembers);

router.get('/sends', ann.listAnnouncementSends);
router.get('/sends/:sendId', ann.getAnnouncementSend);

router.get('/', ann.listAnnouncements);
router.post('/', ann.createAnnouncement);
router.get('/:id', ann.getAnnouncement);
router.patch('/:id', ann.patchAnnouncement);
router.post('/:id/publish', ann.publishAnnouncement);
router.post('/:id/unpublish', ann.unpublishAnnouncement);
router.post('/:id/send', ann.postAnnouncementSend);
router.delete('/:id', ann.deleteAnnouncement);

export default router;
