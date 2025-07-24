import { User } from '../controllers/course.controller';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}