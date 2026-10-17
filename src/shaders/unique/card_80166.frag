#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Enshi: vitality leaves the three risen heads and gathers in the vampire's
// hands. The three streams echo his distribution and inheritance of life.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.1,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.000001),0.0,1.0));
}
vec2 soul(float f,float branch,float t) {
    vec2 a=vec2(0.080,0.477);
    vec2 b=vec2(0.065,0.325);
    vec2 c=vec2(0.280,0.247);
    if(branch>0.5) {
        a=vec2(0.262,0.467);
        b=vec2(0.465,0.336);
        c=vec2(0.280,0.247);
    }
    if(branch>1.5) {
        a=vec2(0.831,0.453);
        b=vec2(0.955,0.333);
        c=vec2(0.823,0.215);
    }
    vec2 q=mix(mix(a,b,f),mix(b,c,f),f);
    q+=sin(f*3.14159)*vec2(0.019*sin(f*19.0-t*2.8+branch*2.0),
                                          0.010*cos(f*16.0-t*2.0));
    return q;
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 base=texture2D(u_card,v_uv);
    float aa=1.0/max(u_resolution.x,1.0);
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.137)*6.283185;
    // Conservative illustration boundary; both left badges and their small
    // counter are excluded together. Nothing reaches title, stats or rules.
    float art=smoothstep(0.139,0.151,p.y)*(1.0-smoothstep(0.540,0.550,p.y));
    art*=smoothstep(0.007,0.020,p.x)*(1.0-smoothstep(0.980,0.994,p.x));
    art*=1.0-(1.0-smoothstep(0.180,0.199,p.x))*(1.0-smoothstep(0.305,0.320,p.y));
    vec3 col=base.rgb;
    float pulse=0.5+0.5*sin(t*3.1+seed);
    float face=oval(p,vec2(0.588,0.229),vec2(0.072,0.061));
    float core=0.0;
    float haze=0.0;
    for(int i=0;i<36;i++) {
        float k=float(i);
        float branch=floor(k/12.0);
        float f=mod(k,12.0)/12.0;
        float d=segment(p,soul(f,branch,t+seed),soul(f+1.0/12.0,branch,t+seed));
        float flow=0.2+0.8*pow(0.5+0.5*cos(f*20.0-t*5.2+branch*2.5+seed),3.0);
        float fade=smoothstep(0.0,0.11,f)*(1.0-smoothstep(0.93,1.05,f));
        core=max(core,(1.0-smoothstep(0.0014,0.0040+aa*0.45,d))*flow*fade);
        haze=max(haze,exp(-d*d/0.00032)*flow*fade);
    }
    col+=(1.0-col)*vec3(0.94,0.075,0.16)*haze*0.65;
    col+=vec3(1.0,0.34,0.16)*core*0.73;
    // Clearly travelling embers make the transfer readable on compact cards.
    float sparks=0.0;
    for(int i=0;i<12;i++) {
        float k=float(i);
        float branch=floor(k/4.0);
        float f=fract(t*0.27+k*0.249+seed*0.03);
        vec2 q=soul(f,branch,t+seed);
        float d=length((p-q)*vec2(1.0,1.4113));
        float fade=smoothstep(0.0,0.10,f)*(1.0-smoothstep(0.90,1.0,f));
        sparks+=(1.0-smoothstep(0.003,0.007+aa*0.4,d))*fade;
    }
    col+=vec3(1.0,0.62,0.26)*sparks*0.80;
    float palms=oval(p,vec2(0.280,0.247),vec2(0.067,0.055))
               +oval(p,vec2(0.823,0.215),vec2(0.052,0.056));
    col+=(1.0-col)*vec3(0.91,0.17,0.075)*palms*(0.25+0.40*pulse);
    // Existing painted crimson ribbons brighten in rising waves.
    float red=smoothstep(0.055,0.24,base.r-base.g)*smoothstep(0.03,0.17,base.r-base.b);
    float ripple=pow(0.5+0.5*sin(p.y*66.0+p.x*13.0+t*4.0+seed),3.0);
    col+=(1.0-col)*vec3(0.95,0.20,0.08)*red*ripple*0.44*(1.0-face);
    if(u_is_foil) {
        // Verdigris armor and the dead faces carry an emerald/copper foil;
        // broad interference bands are present even with time frozen at zero.
        float armor=oval(p,vec2(0.562,0.370),vec2(0.277,0.205));
        float skulls=oval(p,vec2(0.261,0.468),vec2(0.120,0.091))
                    +oval(p,vec2(0.827,0.456),vec2(0.173,0.108));
        float finish=clamp(0.26+armor*0.53+skulls*0.28,0.0,0.88)*(1.0-face*0.92);
        float field=p.x*2.6+p.y*4.9+0.10*sin(p.x*23.0-p.y*19.0)+t*0.08+seed*0.05;
        vec3 iridescence=0.5+0.5*cos(6.283185*(field+vec3(0.05,0.37,0.69)));
        vec3 metal=mix(2.0*col*iridescence,1.0-2.0*(1.0-col)*(1.0-iridescence),step(vec3(0.5),col));
        col=mix(col,metal,finish*0.61);
        float gleam=pow(0.5+0.5*sin(field*9.0-t*1.2),6.0);
        col+=(1.0-col)*(0.08+0.29*gleam)*mix(vec3(0.94,0.61,0.19),iridescence,0.55)*finish;
    }
    gl_FragColor=vec4(mix(base.rgb,clamp(col,0.0,1.0),art),base.a);
}
