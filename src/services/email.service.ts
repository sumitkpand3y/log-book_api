import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

interface EmailData {
  learnerName: string;
  learnerEmail: string;
  submissionTitle: string;
  status: 'approved' | 'rejected';
  teacherName?: string;
  comments?: string;
  submissionId: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'eu-smtp-outbound-1.mimecast.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER || 'noreply@asterhealthacademy.com',
        pass: process.env.EMAIL_PASS || 'okP5HS2BDlcXQnh',
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
      }
    });
  }

  private getEmailTemplate(data: EmailData): { subject: string; html: string; text: string } {
    const { learnerName, submissionTitle, status, teacherName, comments, submissionId } = data;
    
    const isApproved = status === 'approved';
    const statusColor = isApproved ? '#4CAF50' : '#f44336';
    const statusText = isApproved ? 'APPROVED' : 'REJECTED';
    
    const subject = `Submission ${statusText}: ${submissionTitle}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Submission ${statusText}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Aster Health Academy</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #ddd;">
            <div style="background: ${statusColor}; color: white; padding: 15px; border-radius: 5px; text-align: center; margin-bottom: 25px;">
              <h2 style="margin: 0; font-size: 24px;">Submission ${statusText}</h2>
            </div>
            
            <p style="font-size: 18px; margin-bottom: 20px;">Dear <strong>${learnerName}</strong>,</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              Your submission "<strong>${submissionTitle}</strong>" has been <strong style="color: ${statusColor};">${status}</strong> by your teacher.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 5px; border-left: 4px solid ${statusColor}; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">Submission Details:</h3>
              <p><strong>Submission ID:</strong> ${submissionId}</p>
              <p><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></p>
              ${teacherName ? `<p><strong>Reviewed by:</strong> ${teacherName}</p>` : ''}
            </div>
            
            ${comments ? `
              <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #333;">Teacher's Comments:</h3>
                <p style="font-style: italic; color: #555;">"${comments}"</p>
              </div>
            ` : ''}
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/learner/logpage?id=${submissionId}" 
                 style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                View Submission
              </a>
            </div>
            
            <hr style="border: none; height: 1px; background: #ddd; margin: 30px 0;">
            
            <p style="color: #777; font-size: 14px; text-align: center;">
              This is an automated message from Aster Health Academy. Please do not reply to this email.
            </p>
          </div>
        </body>
      </html>
    `;

    const text = `
      Dear ${learnerName},

      Your submission "${submissionTitle}" has been ${status} by your teacher.

      Submission Details:
      - Submission ID: ${submissionId}
      - Status: ${statusText}
      ${teacherName ? `- Reviewed by: ${teacherName}` : ''}

      ${comments ? `Teacher's Comments: "${comments}"` : ''}

      You can view your submission at: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/submissions/${submissionId}

      Best regards,
      Aster Health Academy Team
    `;

    return { subject, html, text };
  }

  async sendSubmissionStatusEmail(emailData: EmailData): Promise<boolean> {
    try {
      const { subject, html, text } = this.getEmailTemplate(emailData);

      const mailOptions = {
        from: `"Aster Health Academy" <${process.env.EMAIL_USER}>`,
        to: emailData.learnerEmail,
        subject,
        html,
        text,
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', result.messageId);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      console.log('Email service is ready');
      return true;
    } catch (error) {
      console.error('Email service connection failed:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();