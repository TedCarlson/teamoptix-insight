<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Validator;

class UserController extends Controller
{

    public function login()
    {
        return view('login');
    }

    public function authLogin(Request $request)
    {
        $formFields = Validator::make($request->all(), [
            "email" => ["required", "email"],
            "password" => "required"
        ]);

        if ($formFields->fails()) {
            return back()->with('signin', false)
                ->withErrors($formFields)
                ->withInput();
        } else {
            $formFields = $request->validate([
                'email' => "",
                'password' => ""
            ]);
        }

        $remember_me = $request->has('remember');

        if (Auth::attempt($formFields, $remember_me)) {
            return redirect()->route("home");
        }

        return back()->withInput()->with('signin', false)->withErrors(['email' => "Invalid Credentials"])->onlyInput('email');
    }
}
