<?php

namespace App\Mail;

use App\Models\License;
use App\Models\Store;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class LicenseExpiringMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Store $store,
        public License $license,
        public int $daysLeft,
        public string $renewUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: match (true) {
                $this->daysLeft > 0 => "اشتراک تاکسی کارن تا {$this->daysLeft} روز دیگر تمدید شود",
                $this->daysLeft === 0 => 'امروز آخرین روز اعتبار اشتراک تاکسی کارن است',
                default => 'اعتبار اشتراک تاکسی کارن به پایان رسید',
            },
        );
    }

    public function content(): Content
    {
        return new Content(view: 'mail.license-expiring');
    }
}
