# riffmaster

## Core business

Guitar Pro-like or Songsterr-like application but much more simpler and straightforward, focused on composition rather than practicing or learning songs.

## Features

- Basic midi-like sounds for electric guitar (two different colors to distinguish songs with two guitars), electric bass, clean guitar, and drums.
- Notation must be the same as guitar pro 5 for both strings instruments and percussion instruments.
- Set tempo. (Can increase or decrease speed from the original tempo without changing it).
- Metronome.
- Set music notation. (4/4, 3/4, 6/8, etc).
- Music figures.
- Expression tools like vibratos, slides, etc, are nice to have but not necessary.
- Solo/Mute one or more instruments.
- Dark and light theme.
- Both stringed and percussion instrument show dual notation just like in GPro 5:
<img width="112" height="106" alt="image" src="https://github.com/user-attachments/assets/85716c60-19e2-445f-afc0-99ac701484ef" />
(Music figures up, tab down).

## Tech

- Super light as possible frontend with pure JS.
- Backend relies only on free tier firebase.
- Sign up and log in are optional if you wanna save your composition. (Log out is also needed).
- Sign up requires email and password. Email must be unique and password must be hashed.
- Saving your song asks for name.
- Frontend must be able to host on free github pages, using free firebase as backend only for auth and saving songs.
